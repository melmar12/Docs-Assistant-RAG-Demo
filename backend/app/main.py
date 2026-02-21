"""FastAPI server for the RAG docs assistant.

Exposes endpoints for semantic retrieval (/retrieve), retrieval + LLM
generation (/query), retrieval diagnostics (/debug-query), and a doc
browser API (/api/docs). Uses ChromaDB for vector search and OpenAI
for embeddings and completions.
"""

import json
import os
from pathlib import Path
from typing import AsyncGenerator

from dotenv import load_dotenv

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_FILE)

import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

CHROMA_DIR = Path(__file__).resolve().parent.parent / "chroma_db"
DOCS_DIR = Path(__file__).resolve().parent.parent / "docs"
COLLECTION_NAME = "internal_docs"
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
COMPLETION_MODEL = os.environ.get("COMPLETION_MODEL", "gpt-4o-mini")

app = FastAPI()

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again later.")


CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# Initialize Chroma client + collection once at startup
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError("OPENAI_API_KEY environment variable is not set")

embedding_fn = OpenAIEmbeddingFunction(
    api_key=api_key,
    model_name=EMBEDDING_MODEL,
)

openai_client = OpenAI(api_key=api_key, timeout=30.0)

chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
collection = chroma_client.get_or_create_collection(
    name=COLLECTION_NAME,
    embedding_function=embedding_fn,
)


class RetrieveRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1, le=20)


class ChunkResult(BaseModel):
    doc_id: str
    score: float
    text: str


class RetrieveResponse(BaseModel):
    results: list[ChunkResult]


@app.get("/health")
def health():
    """Simple liveness check — returns ``{"status": "ok"}``."""
    return {"status": "ok"}


@app.post("/retrieve", response_model=RetrieveResponse)
@limiter.limit("30/minute")
def retrieve(req: RetrieveRequest, request: Request):
    """Return the top-k most similar chunks for a query (retrieval only, no LLM)."""
    if collection.count() == 0:
        raise HTTPException(status_code=503, detail="No documents ingested yet. Run: python -m app.ingest")

    results = collection.query(
        query_texts=[req.query],
        n_results=min(req.top_k, collection.count()),
    )

    chunks = []
    for doc_id, distance, text in zip(
        results["ids"][0],
        results["distances"][0],
        results["documents"][0],
    ):
        chunks.append(ChunkResult(
            doc_id=doc_id,
            score=round(1 - distance, 4),  # Chroma returns distance; convert to similarity
            text=text,
        ))

    return RetrieveResponse(results=chunks)


SYSTEM_PROMPT = """You are an internal documentation assistant. Answer the user's question using ONLY the provided context below. Do not use any prior knowledge.

If the context does not contain enough information to answer the question, respond with: "I don't know based on the available documentation."

Be concise and direct. Cite the source document when possible.

Context:
{context}"""


class QueryRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1, le=20)


class QueryResponse(BaseModel):
    answer: str
    sources: list[str]
    chunks: list[ChunkResult]


@app.post("/query", response_model=QueryResponse)
@limiter.limit("10/minute")
def query(req: QueryRequest, request: Request):
    """Retrieve relevant chunks and generate an LLM answer grounded in them."""
    if collection.count() == 0:
        raise HTTPException(status_code=503, detail="No documents ingested yet. Run: python -m app.ingest")

    results = collection.query(
        query_texts=[req.query],
        n_results=min(req.top_k, collection.count()),
    )

    # Build context and chunk results from retrieved chunks
    context_parts = []
    sources = []
    chunks = []
    for doc_id, distance, text in zip(
        results["ids"][0],
        results["distances"][0],
        results["documents"][0],
    ):
        source = doc_id.split("::")[0]
        context_parts.append(f"[Source: {source}]\n{text}")
        if source not in sources:
            sources.append(source)
        chunks.append(ChunkResult(
            doc_id=doc_id,
            score=round(1 - distance, 4),
            text=text,
        ))

    context = "\n\n---\n\n".join(context_parts)

    try:
        completion = openai_client.chat.completions.create(
            model=COMPLETION_MODEL,
            temperature=0.1,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT.format(context=context)},
                {"role": "user", "content": req.query},
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"LLM request failed: {e}")

    return QueryResponse(
        answer=completion.choices[0].message.content,
        sources=sources,
        chunks=chunks,
    )


async def stream_query_response(req: QueryRequest) -> AsyncGenerator[str, None]:
    """Async generator that yields SSE-formatted strings for /query/stream.

    Event sequence:
      metadata — sources + chunks, emitted right after vector search
      token    — one per LLM output token
      done     — signals end of stream
      error    — emitted instead of done if something goes wrong
    """
    if collection.count() == 0:
        yield f"event: error\ndata: {json.dumps({'detail': 'No documents ingested yet. Run: python -m app.ingest'})}\n\n"
        return

    try:
        results = collection.query(
            query_texts=[req.query],
            n_results=min(req.top_k, collection.count()),
        )

        context_parts, sources, chunks = [], [], []
        for doc_id, distance, text in zip(
            results["ids"][0],
            results["distances"][0],
            results["documents"][0],
        ):
            source = doc_id.split("::")[0]
            context_parts.append(f"[Source: {source}]\n{text}")
            if source not in sources:
                sources.append(source)
            chunks.append(ChunkResult(doc_id=doc_id, score=round(1 - distance, 4), text=text))

        yield f"event: metadata\ndata: {json.dumps({'sources': sources, 'chunks': [c.model_dump() for c in chunks]})}\n\n"
    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'detail': f'Vector search failed: {e}'})}\n\n"
        return

    try:
        stream = openai_client.chat.completions.create(
            model=COMPLETION_MODEL,
            temperature=0.1,
            stream=True,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT.format(context="\n\n---\n\n".join(context_parts))},
                {"role": "user", "content": req.query},
            ],
        )
        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield f"event: token\ndata: {json.dumps({'text': delta.content})}\n\n"
    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'detail': f'LLM request failed: {e}'})}\n\n"
        return

    yield "event: done\ndata: {}\n\n"


@app.post("/query/stream")
@limiter.limit("10/minute")
async def query_stream(req: QueryRequest, request: Request):
    """Stream retrieval and LLM generation as Server-Sent Events."""
    return StreamingResponse(
        stream_query_response(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class DebugChunk(BaseModel):
    doc_id: str
    section: str
    chunk_index: int
    score: float
    preview: str


class DebugQueryResponse(BaseModel):
    query: str
    results: list[DebugChunk]


@app.post("/debug-query", response_model=DebugQueryResponse)
def debug_query(req: RetrieveRequest):
    """Return retrieval diagnostics: doc_id, section, chunk_id, score, first 200 chars."""
    if collection.count() == 0:
        raise HTTPException(status_code=503, detail="No documents ingested yet. Run: python -m app.ingest")

    results = collection.query(
        query_texts=[req.query],
        n_results=min(req.top_k, collection.count()),
        include=["documents", "distances", "metadatas"],
    )

    debug_results = []
    for doc_id, distance, text, meta in zip(
        results["ids"][0],
        results["distances"][0],
        results["documents"][0],
        results["metadatas"][0],
    ):
        debug_results.append(DebugChunk(
            doc_id=doc_id,
            section=meta.get("section", ""),
            chunk_index=meta.get("chunk_index", -1),
            score=round(1 - distance, 4),
            preview=text[:200],
        ))

    return DebugQueryResponse(query=req.query, results=debug_results)


@app.get("/api/docs")
def list_docs():
    """Return a list of available documentation filenames."""
    files = sorted(DOCS_DIR.glob("*.md"))
    return [f.name for f in files]


@app.get("/api/docs/{filename}")
def get_doc(filename: str):
    """Return the raw markdown content of a documentation file."""
    if not filename.endswith(".md") or "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=404, detail="Not found")
    path = (DOCS_DIR / filename).resolve()
    if not path.is_relative_to(DOCS_DIR.resolve()) or not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")

    try:
        md_text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=500, detail=f"File encoding error: {filename}")
    return {"filename": filename, "content": md_text}
