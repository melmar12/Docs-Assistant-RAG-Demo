"""Shared pytest fixtures for backend integration tests.

Sets OPENAI_API_KEY before importing the app (required because main.py reads
it at module level).  Provides a FakeEmbeddingFunction and fixtures for a
pre-seeded real ChromaDB EphemeralClient collection and an empty one.
"""

import os
import uuid

os.environ.setdefault("OPENAI_API_KEY", "test-key")

import chromadb
import pytest
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings
from fastapi.testclient import TestClient
from unittest.mock import patch

from backend.app.main import app

# Disable rate limiting once for all tests in this process
app.state.limiter._default_limits = []


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Reset limiter counters before every test.

    The integration tests make multiple requests to the same endpoints (e.g.
    /query/stream) and, when combined with the unit tests in test_main.py,
    can exceed the per-route limit (10/minute).  Resetting the in-memory
    storage before each test keeps counts isolated.
    """
    app.state.limiter._storage.reset()
    yield

# ---------------------------------------------------------------------------
# Seed data — shared across integration tests
# ---------------------------------------------------------------------------

SEED_IDS = ["guide.md::chunk0", "guide.md::chunk1", "faq.md::chunk0"]
SEED_DOCUMENTS = [
    "## Installation\n\nInstall with pip install mypackage.",
    "## Configuration\n\nSet the API_KEY environment variable.",
    "## FAQ\n\nFrequently asked questions about the product.",
]
SEED_METADATAS = [
    {"source": "guide.md", "section": "Installation", "chunk_index": 0},
    {"source": "guide.md", "section": "Configuration", "chunk_index": 1},
    {"source": "faq.md", "section": "FAQ", "chunk_index": 0},
]


# ---------------------------------------------------------------------------
# FakeEmbeddingFunction
# ---------------------------------------------------------------------------

class FakeEmbeddingFunction(EmbeddingFunction[Documents]):
    """Deterministic 4-dim embedding function — no OpenAI calls.

    Uses a hash of the document text to produce distinct first components so
    cosine distances are non-zero and ordering is deterministic for a given
    PYTHONHASHSEED.  Tests should assert count and schema, not specific ordering.
    """

    def __init__(self) -> None:
        pass  # suppress DeprecationWarning from base class __init__

    def __call__(self, input: Documents) -> Embeddings:
        return [[float(hash(doc) % 100) / 100.0, 0.5, 0.5, 0.5] for doc in input]

    @staticmethod
    def name() -> str:
        return "fake-embedding-function"

    def get_config(self) -> dict:
        return {}

    @staticmethod
    def build_from_config(config: dict) -> "FakeEmbeddingFunction":
        return FakeEmbeddingFunction()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def seeded_collection():
    """Session-scoped real ChromaDB in-memory collection with 3 test documents.

    NOTE: chromadb.EphemeralClient() instances share a single global in-memory
    store in ChromaDB 1.5.0, so isolation is by collection name, not client.
    This collection is read-only during tests — never upsert/delete from it.
    """
    ec = chromadb.EphemeralClient()
    col = ec.get_or_create_collection(
        name="integration_seeded",
        embedding_function=FakeEmbeddingFunction(),
        metadata={"hnsw:space": "cosine"},
    )
    col.upsert(ids=SEED_IDS, documents=SEED_DOCUMENTS, metadatas=SEED_METADATAS)
    yield col


@pytest.fixture
def empty_collection():
    """Function-scoped real ChromaDB in-memory collection with 0 documents.

    Uses a uuid4 suffix to guarantee a fresh collection name on every call,
    since all EphemeralClient instances share the same global store.
    """
    ec = chromadb.EphemeralClient()
    col = ec.get_or_create_collection(
        name=f"integration_empty_{uuid.uuid4().hex}",
        embedding_function=FakeEmbeddingFunction(),
        metadata={"hnsw:space": "cosine"},
    )
    yield col


@pytest.fixture
def integration_client(seeded_collection):
    """TestClient with backend.app.main.collection replaced by the seeded collection."""
    with patch("backend.app.main.collection", seeded_collection):
        yield TestClient(app)


@pytest.fixture
def empty_integration_client(empty_collection):
    """TestClient with backend.app.main.collection replaced by an empty collection."""
    with patch("backend.app.main.collection", empty_collection):
        yield TestClient(app)
