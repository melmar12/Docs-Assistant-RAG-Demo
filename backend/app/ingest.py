"""Ingestion script: loads markdown files, chunks them, embeds via OpenAI, stores in ChromaDB."""

import logging
import os
import re
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

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
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
MAX_CHUNK_CHARS = 1500


def load_markdown_files(docs_dir: Path) -> list[dict]:
    """Load all .md files from the given directory.

    Returns a list of dicts with keys: ``filename``, ``relative_path``, ``content``.
    """
    documents = []
    for md_file in sorted(docs_dir.glob("**/*.md")):
        text = md_file.read_text(encoding="utf-8")
        documents.append({
            "filename": md_file.name,
            "relative_path": str(md_file.relative_to(docs_dir)),
            "content": text,
        })
    return documents


def _split_by_headings(text: str) -> list[tuple[str, str]]:
    """Split markdown into (heading, body) pairs on ``## `` boundaries.

    Returns a list of tuples.  The first entry may have heading="" for any
    content before the first ``## `` heading (e.g. front-matter or the
    ``# Title`` line).
    """
    pattern = re.compile(r"^(## .+)$", re.MULTILINE)
    parts = pattern.split(text)

    sections: list[tuple[str, str]] = []
    # parts alternates: [pre-text, heading1, body1, heading2, body2, ...]
    # First element is everything before the first ## heading
    preamble = parts[0].strip()
    if preamble:
        sections.append(("", preamble))

    for i in range(1, len(parts), 2):
        heading = parts[i].strip()
        body = parts[i + 1].strip() if i + 1 < len(parts) else ""
        sections.append((heading, body))

    return sections


def _extract_title(text: str) -> str:
    """Return the first ``# Title`` line (not ##) or empty string."""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            return stripped
    return ""


def _split_section_by_paragraphs(
    section_text: str, title: str, heading: str, max_chars: int
) -> list[str]:
    """Split an oversized section into sub-chunks at paragraph boundaries.

    Each sub-chunk is prefixed with the title and heading so the LLM always
    has context about which section the content belongs to.
    """
    prefix = ""
    if title:
        prefix += title + "\n\n"
    if heading:
        prefix += heading + "\n\n"

    paragraphs = re.split(r"\n{2,}", section_text)
    chunks: list[str] = []
    current = prefix

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        candidate = current + para + "\n\n"
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current.strip() != prefix.strip():
                chunks.append(current.strip())
            current = prefix + para + "\n\n"

    if current.strip() and current.strip() != prefix.strip():
        chunks.append(current.strip())

    return chunks if chunks else [section_text.strip()]


def chunk_markdown(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[dict]:
    """Split a markdown document into heading-aware chunks.

    Returns a list of dicts with keys: ``text``, ``section``.
    """
    title = _extract_title(text)
    sections = _split_by_headings(text)

    chunks: list[dict] = []

    for heading, body in sections:
        section_name = heading.lstrip("# ").strip() if heading else "(intro)"

        # Assemble full chunk text: title + heading + body
        parts = []
        if title and heading:
            # Include doc title for context in every non-preamble chunk
            parts.append(title)
        if heading:
            parts.append(heading)
        if body:
            parts.append(body)
        full_text = "\n\n".join(parts)

        if len(full_text) <= max_chars:
            chunks.append({"text": full_text, "section": section_name})
        else:
            # Section too large — sub-chunk by paragraph
            sub_chunks = _split_section_by_paragraphs(body, title, heading, max_chars)
            for sub_text in sub_chunks:
                chunks.append({"text": sub_text, "section": section_name})

    return chunks


def ingest():
    """Main ingestion pipeline.

    Loads markdown files from ``docs/``, chunks them by heading boundaries,
    embeds via OpenAI, and upserts into a ChromaDB collection.
    """
    from .logging_config import setup_logging
    setup_logging()

    if not DOCS_DIR.exists():
        logger.error("Docs directory not found: %s", DOCS_DIR)
        sys.exit(1)

    documents = load_markdown_files(DOCS_DIR)
    if not documents:
        logger.error("No markdown files found in %s", DOCS_DIR)
        sys.exit(1)

    logger.info("Found %d markdown file(s)", len(documents))

    # Prepare chunks with metadata
    all_ids: list[str] = []
    all_chunks: list[str] = []
    all_metadatas: list[dict] = []

    for doc in documents:
        chunks = chunk_markdown(doc["content"])
        logger.info("doc_chunked", extra={"relative_path": doc["relative_path"], "num_chunks": len(chunks)})
        for i, chunk in enumerate(chunks):
            all_ids.append(f"{doc['relative_path']}::chunk{i}")
            all_chunks.append(chunk["text"])
            all_metadatas.append({
                "source": doc["relative_path"],
                "filename": doc["filename"],
                "chunk_index": i,
                "section": chunk["section"],
            })

    logger.info("ingest_chunks_total", extra={"total_chunks": len(all_chunks)})

    # Initialize ChromaDB with OpenAI embeddings
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY environment variable is not set")
        sys.exit(1)

    embedding_fn = OpenAIEmbeddingFunction(
        api_key=api_key,
        model_name=EMBEDDING_MODEL,
    )

    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    # Delete existing collection to do a clean re-ingest
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception as e:
        logger.warning("Could not delete existing collection: %s", e)

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

    logger.info("ingest_complete", extra={"total_chunks": collection.count(), "chroma_dir": str(CHROMA_DIR)})


if __name__ == "__main__":
    ingest()
