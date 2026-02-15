import os
from pathlib import Path

from dotenv import load_dotenv

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_FILE)

import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

CHROMA_DIR = Path(__file__).resolve().parent.parent / "chroma_db"
COLLECTION_NAME = "internal_docs"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
