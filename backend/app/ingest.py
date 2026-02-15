"""Ingestion script: loads markdown files, chunks them, embeds via OpenAI, stores in ChromaDB."""

import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    print("Error: python-dotenv is not installed. Install it with: pip install python-dotenv")
    sys.exit(1)

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_FILE)

try:
    import chromadb
    from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
except ImportError:
    print("Error: chromadb is not installed. Install it with: pip install chromadb")
    sys.exit(1)

DOCS_DIR = Path(__file__).resolve().parent.parent / "docs"
CHROMA_DIR = Path(__file__).resolve().parent.parent / "chroma_db"
COLLECTION_NAME = "internal_docs"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50


def load_markdown_files(docs_dir: Path) -> list[dict]:
    """Load all .md files from the docs directory."""
    documents = []
    for md_file in sorted(docs_dir.glob("**/*.md")):
        text = md_file.read_text(encoding="utf-8")
        documents.append({
            "filename": md_file.name,
            "relative_path": str(md_file.relative_to(docs_dir)),
            "content": text,
        })
    return documents


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks by character count, breaking at paragraph boundaries."""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size

        # Try to break at a paragraph boundary (double newline)
        if end < len(text):
            boundary = text.rfind("\n\n", start + overlap, end)
            if boundary != -1:
                end = boundary + 2  # include the double newline

        chunks.append(text[start:end].strip())
        start = end - overlap

    # Drop any empty trailing chunks
    return [c for c in chunks if c]


def ingest():
    """Main ingestion pipeline."""
    if not DOCS_DIR.exists():
        print(f"Docs directory not found: {DOCS_DIR}")
        sys.exit(1)

    documents = load_markdown_files(DOCS_DIR)
    if not documents:
        print("No markdown files found in", DOCS_DIR)
        sys.exit(1)

    print(f"Found {len(documents)} markdown file(s)")

    # Prepare chunks with metadata
    all_ids: list[str] = []
    all_chunks: list[str] = []
    all_metadatas: list[dict] = []

    for doc in documents:
        chunks = chunk_text(doc["content"])
        print(f"  {doc['relative_path']}: {len(chunks)} chunk(s)")
        for i, chunk in enumerate(chunks):
            all_ids.append(f"{doc['relative_path']}::chunk{i}")
            all_chunks.append(chunk)
            all_metadatas.append({
                "source": doc["relative_path"],
                "filename": doc["filename"],
                "chunk_index": i,
            })

    print(f"Total chunks: {len(all_chunks)}")

    # Initialize ChromaDB with OpenAI embeddings
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable is not set")
        sys.exit(1)

    embedding_fn = OpenAIEmbeddingFunction(
        api_key=api_key,
        model_name="text-embedding-3-small",
    )

    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    # Delete existing collection to do a clean re-ingest
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=embedding_fn,
    )

    # Upsert in batches of 100 (Chroma's recommended batch size)
    batch_size = 100
    for i in range(0, len(all_chunks), batch_size):
        end = min(i + batch_size, len(all_chunks))
        collection.upsert(
            ids=all_ids[i:end],
            documents=all_chunks[i:end],
            metadatas=all_metadatas[i:end],
        )

    print(f"Ingested {collection.count()} chunks into ChromaDB at {CHROMA_DIR}")


if __name__ == "__main__":
    ingest()
