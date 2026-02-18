import os
from pathlib import Path

from dotenv import load_dotenv

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_FILE)

import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

CHROMA_DIR = Path(__file__).resolve().parent.parent / "chroma_db"
DOCS_DIR = Path(__file__).resolve().parent.parent / "docs"
COLLECTION_NAME = "internal_docs"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Chroma client + collection once at startup
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError("OPENAI_API_KEY environment variable is not set")

embedding_fn = OpenAIEmbeddingFunction(
    api_key=api_key,
    model_name="text-embedding-3-small",
)

openai_client = OpenAI(api_key=api_key)

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
    return {"status": "ok"}


@app.post("/retrieve", response_model=RetrieveResponse)
def retrieve(req: RetrieveRequest):
    if collection.count() == 0:
        raise HTTPException(status_code=404, detail="No documents ingested yet. Run: python -m app.ingest")

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
def query(req: QueryRequest):
    if collection.count() == 0:
        raise HTTPException(status_code=404, detail="No documents ingested yet. Run: python -m app.ingest")

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

    completion = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.1,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT.format(context=context)},
            {"role": "user", "content": req.query},
        ],
    )

    return QueryResponse(
        answer=completion.choices[0].message.content,
        sources=sources,
        chunks=chunks,
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
        raise HTTPException(status_code=404, detail="No documents ingested yet. Run: python -m app.ingest")

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

    md_text = path.read_text(encoding="utf-8")
    return {"filename": filename, "content": md_text}
