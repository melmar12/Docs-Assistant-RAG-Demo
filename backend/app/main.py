"""FastAPI server for the RAG docs assistant.

Exposes endpoints for semantic retrieval (/retrieve), retrieval + LLM
generation (/query), retrieval diagnostics (/debug-query), and a doc
browser API (/api/docs). Uses ChromaDB for vector search and OpenAI
for embeddings and completions.
"""

import asyncio
import contextlib
import json
import logging
import os
import random
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator, Literal

from dotenv import load_dotenv

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_FILE)

from .logging_config import request_id_var, setup_logging

# setup_logging() is called here intentionally — before third-party imports —
# so that the root logger is configured with JsonFormatter before any library
# (chromadb, openai, uvicorn, …) registers its own handlers or emits records.
setup_logging()
logger = logging.getLogger(__name__)

import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import (
    APIConnectionError,
    APITimeoutError,
    AsyncOpenAI,
    InternalServerError,
    OpenAI,
    RateLimitError,
)
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

CHROMA_DIR = Path(__file__).resolve().parent.parent / "chroma_db"
_default_feedback_db = Path(__file__).resolve().parent.parent / "feedback.db"
FEEDBACK_DB = Path(os.environ.get("FEEDBACK_DB", str(_default_feedback_db)))
DOCS_DIR = Path(__file__).resolve().parent.parent / "docs"
COLLECTION_NAME = "internal_docs"
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
COMPLETION_MODEL = os.environ.get("COMPLETION_MODEL", "gpt-4o-mini")

def _init_feedback_db() -> None:
    """Create the feedback table if it doesn't exist."""
    with sqlite3.connect(FEEDBACK_DB) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS feedback (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT    NOT NULL,
                query      TEXT    NOT NULL,
                answer     TEXT    NOT NULL,
                rating     TEXT    NOT NULL CHECK(rating IN ('up', 'down')),
                comment    TEXT
            )
            """
        )

# Retry configuration for transient OpenAI errors (rate limits, timeouts, etc.)
OPENAI_RETRYABLE = (RateLimitError, APITimeoutError, APIConnectionError, InternalServerError)
OPENAI_MAX_RETRIES = int(os.environ.get("OPENAI_MAX_RETRIES", "3"))
_retry_base_delay_raw = os.environ.get("OPENAI_RETRY_BASE_DELAY", "1.0")
try:
    OPENAI_RETRY_BASE_DELAY = float(_retry_base_delay_raw)
    if OPENAI_RETRY_BASE_DELAY <= 0:
        logger.warning(
            "OPENAI_RETRY_BASE_DELAY must be positive; got %r. Falling back to default 1.0.",
            _retry_base_delay_raw,
        )
        OPENAI_RETRY_BASE_DELAY = 1.0
except (TypeError, ValueError):
    logger.warning(
        "Invalid OPENAI_RETRY_BASE_DELAY value %r. Falling back to default 1.0.",
        _retry_base_delay_raw,
    )
    OPENAI_RETRY_BASE_DELAY = 1.0

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    _init_feedback_db()
    yield


app = FastAPI(lifespan=lifespan)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again later.")


CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    """Assign a request ID and log request start/end with total latency."""
    req_id = str(uuid.uuid4())
    token = request_id_var.set(req_id)
    t0 = time.perf_counter()
    logger.info(
        "request_start",
        extra={
            "endpoint": request.url.path,
            "method": request.method,
            "client_ip": request.client.host if request.client else None,
        },
    )
    response = None
    try:
        response = await call_next(request)
        return response
    except Exception:
        logger.exception("request_unhandled_exception")
        raise
    finally:
        latency_ms = round((time.perf_counter() - t0) * 1000)
        logger.info(
            "request_end",
            extra={
                "endpoint": request.url.path,
                "latency_ms": latency_ms,
                "status_code": response.status_code if response is not None else None,
            },
        )
        request_id_var.reset(token)


# Initialize Chroma client + collection once at startup
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError("OPENAI_API_KEY environment variable is not set")

embedding_fn = OpenAIEmbeddingFunction(
    api_key=api_key,
    model_name=EMBEDDING_MODEL,
)

openai_client = OpenAI(api_key=api_key, timeout=30.0, max_retries=0)
async_openai_client = AsyncOpenAI(api_key=api_key, timeout=30.0, max_retries=0)

chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
collection = chroma_client.get_or_create_collection(
    name=COLLECTION_NAME,
    embedding_function=embedding_fn,
)


def _openai_call_with_retry(fn):
    """Call fn() with exponential backoff on transient OpenAI errors (sync)."""
    max_attempts = max(1, OPENAI_MAX_RETRIES)
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except OPENAI_RETRYABLE as e:
            if attempt == max_attempts:
                raise
            delay = OPENAI_RETRY_BASE_DELAY * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
            logger.warning(
                "openai_retry",
                extra={"attempt": attempt, "max_attempts": max_attempts, "delay_s": round(delay, 2), "error": str(e)},
            )
            time.sleep(delay)


async def _async_openai_call_with_retry(coro_fn):
    """Call coro_fn() with exponential backoff on transient OpenAI errors (async)."""
    max_attempts = max(1, OPENAI_MAX_RETRIES)
    for attempt in range(1, max_attempts + 1):
        try:
            return await coro_fn()
        except OPENAI_RETRYABLE as e:
            if attempt == max_attempts:
                raise
            delay = OPENAI_RETRY_BASE_DELAY * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
            logger.warning(
                "openai_retry",
                extra={"attempt": attempt, "max_attempts": max_attempts, "delay_s": round(delay, 2), "error": str(e)},
            )
            await asyncio.sleep(delay)


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
    logger.info("retrieve_request", extra={"query": req.query, "top_k": req.top_k})

    if collection.count() == 0:
        logger.warning("retrieve_no_docs")
        raise HTTPException(status_code=503, detail="No documents ingested yet. Run: python -m app.ingest")

    t0 = time.perf_counter()
    results = collection.query(
        query_texts=[req.query],
        n_results=min(req.top_k, collection.count()),
    )
    retrieval_ms = round((time.perf_counter() - t0) * 1000)

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

    logger.info(
        "retrieval_complete",
        extra={
            "num_results": len(chunks),
            "top_score": chunks[0].score if chunks else None,
            "latency_ms": retrieval_ms,
        },
    )
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
    logger.info("query_request", extra={"query": req.query, "top_k": req.top_k})

    if collection.count() == 0:
        logger.warning("query_no_docs")
        raise HTTPException(status_code=503, detail="No documents ingested yet. Run: python -m app.ingest")

    t0 = time.perf_counter()
    results = collection.query(
        query_texts=[req.query],
        n_results=min(req.top_k, collection.count()),
    )
    retrieval_ms = round((time.perf_counter() - t0) * 1000)

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

    logger.info(
        "retrieval_complete",
        extra={
            "query": req.query,
            "num_results": len(chunks),
            "top_score": chunks[0].score if chunks else None,
            "latency_ms": retrieval_ms,
        },
    )

    context = "\n\n---\n\n".join(context_parts)

    try:
        t1 = time.perf_counter()
        completion = _openai_call_with_retry(
            lambda: openai_client.chat.completions.create(
                model=COMPLETION_MODEL,
                temperature=0.1,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT.format(context=context)},
                    {"role": "user", "content": req.query},
                ],
            )
        )
        llm_ms = round((time.perf_counter() - t1) * 1000)
        logger.info(
            "llm_complete",
            extra={"model": COMPLETION_MODEL, "latency_ms": llm_ms, "num_sources": len(sources)},
        )
    except Exception as e:
        logger.error(
            "llm_error",
            extra={"status_code": 503, "detail": str(e)},
            exc_info=True,
        )
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
        logger.warning("stream_no_docs")
        yield f"event: error\ndata: {json.dumps({'detail': 'No documents ingested yet. Run: python -m app.ingest'})}\n\n"
        return

    try:
        t0 = time.perf_counter()
        results = collection.query(
            query_texts=[req.query],
            n_results=min(req.top_k, collection.count()),
        )
        retrieval_ms = round((time.perf_counter() - t0) * 1000)

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

        logger.info(
            "stream_retrieval_complete",
            extra={
                "query": req.query,
                "num_results": len(chunks),
                "top_score": chunks[0].score if chunks else None,
                "latency_ms": retrieval_ms,
            },
        )
        yield f"event: metadata\ndata: {json.dumps({'sources': sources, 'chunks': [c.model_dump() for c in chunks]})}\n\n"
    except Exception as e:
        logger.error("stream_retrieval_error", extra={"detail": str(e)}, exc_info=True)
        yield f"event: error\ndata: {json.dumps({'detail': f'Vector search failed: {e}'})}\n\n"
        return

    try:
        t1 = time.perf_counter()
        stream = await _async_openai_call_with_retry(
            lambda: async_openai_client.chat.completions.create(
                model=COMPLETION_MODEL,
                temperature=0.1,
                stream=True,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT.format(context="\n\n---\n\n".join(context_parts))},
                    {"role": "user", "content": req.query},
                ],
            )
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield f"event: token\ndata: {json.dumps({'text': delta.content})}\n\n"
        llm_ms = round((time.perf_counter() - t1) * 1000)
        logger.info(
            "stream_llm_complete",
            extra={"model": COMPLETION_MODEL, "latency_ms": llm_ms, "num_sources": len(sources)},
        )
    except Exception as e:
        logger.error("stream_llm_error", extra={"detail": str(e)}, exc_info=True)
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


class FeedbackRequest(BaseModel):
    query: str
    answer: str
    rating: Literal["up", "down"]
    comment: str | None = None


@app.post("/feedback")
@limiter.limit("10/minute")
def submit_feedback(req: FeedbackRequest, request: Request):
    """Record a thumbs-up or thumbs-down rating for an answer."""
    created_at = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(FEEDBACK_DB) as conn:
        conn.execute(
            "INSERT INTO feedback (created_at, query, answer, rating, comment) VALUES (?, ?, ?, ?, ?)",
            (created_at, req.query, req.answer, req.rating, req.comment),
        )
    logger.info(
        "feedback_received",
        extra={"rating": req.rating, "query_preview": req.query[:120]},
    )
    return {"status": "ok"}


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
    logger.info("debug_query_request", extra={"query": req.query, "top_k": req.top_k})

    if collection.count() == 0:
        logger.warning("debug_query_no_docs")
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
        logger.warning("doc_not_found", extra={"doc_filename": filename, "status_code": 404})
        raise HTTPException(status_code=404, detail="Not found")
    path = (DOCS_DIR / filename).resolve()
    if not path.is_relative_to(DOCS_DIR.resolve()) or not path.is_file():
        logger.warning("doc_not_found", extra={"doc_filename": filename, "status_code": 404})
        raise HTTPException(status_code=404, detail="Not found")

    try:
        md_text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        logger.error("doc_encoding_error", extra={"doc_filename": filename, "status_code": 500})
        raise HTTPException(status_code=500, detail=f"File encoding error: {filename}")
    return {"filename": filename, "content": md_text}
