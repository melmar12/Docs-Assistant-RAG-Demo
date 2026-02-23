import os
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import openai

os.environ.setdefault("OPENAI_API_KEY", "test-key")

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

# Disable rate limiting in tests
app.state.limiter._default_limits = []

MOCK_QUERY_RESULTS = {
    "ids": [["onboarding.md::chunk0", "onboarding.md::chunk1"]],
    "distances": [[0.2, 0.4]],
    "documents": [["First chunk text.", "Second chunk text."]],
    "metadatas": [[{"section": "Intro", "chunk_index": 0}, {"section": "Setup", "chunk_index": 1}]],
}


@pytest.fixture
def client():
    return TestClient(app)


# --- Health ---


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


# --- /api/docs ---


def test_list_docs(client):
    res = client.get("/api/docs")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert all(name.endswith(".md") for name in data)


def test_get_doc_valid(client):
    res = client.get("/api/docs/onboarding.md")
    assert res.status_code == 200
    data = res.json()
    assert data["filename"] == "onboarding.md"
    assert len(data["content"]) > 0


@pytest.mark.parametrize("filename", [
    "../secret.md",
    "../../etc/passwd",
    "docs/../../secret.md",
    "file\\path.md",
])
def test_get_doc_path_traversal(client, filename):
    res = client.get(f"/api/docs/{filename}")
    assert res.status_code == 404


def test_get_doc_not_found(client):
    res = client.get("/api/docs/nonexistent-file.md")
    assert res.status_code == 404


# --- /retrieve ---


@patch("backend.app.main.collection")
def test_retrieve(mock_col, client):
    mock_col.count.return_value = 5
    mock_col.query.return_value = MOCK_QUERY_RESULTS
    res = client.post("/retrieve", json={"query": "How do I onboard?"})
    assert res.status_code == 200
    data = res.json()
    assert len(data["results"]) == 2
    assert data["results"][0]["doc_id"] == "onboarding.md::chunk0"
    assert data["results"][0]["score"] == 0.8


@patch("backend.app.main.collection")
def test_retrieve_empty_collection(mock_col, client):
    mock_col.count.return_value = 0
    res = client.post("/retrieve", json={"query": "test"})
    assert res.status_code == 503


# --- /query ---


@patch("backend.app.main.openai_client")
@patch("backend.app.main.collection")
def test_query(mock_col, mock_openai, client):
    mock_col.count.return_value = 5
    mock_col.query.return_value = MOCK_QUERY_RESULTS
    choice = MagicMock()
    choice.message.content = "Mocked answer."
    mock_openai.chat.completions.create.return_value = MagicMock(choices=[choice])

    res = client.post("/query", json={"query": "How do I onboard?"})
    assert res.status_code == 200
    data = res.json()
    assert data["answer"] == "Mocked answer."
    assert "onboarding.md" in data["sources"]
    assert len(data["chunks"]) == 2


@patch("backend.app.main.collection")
def test_query_empty_collection(mock_col, client):
    mock_col.count.return_value = 0
    res = client.post("/query", json={"query": "test"})
    assert res.status_code == 503


@patch("backend.app.main.openai_client")
@patch("backend.app.main.collection")
def test_query_openai_failure(mock_col, mock_openai, client):
    mock_col.count.return_value = 5
    mock_col.query.return_value = MOCK_QUERY_RESULTS
    mock_openai.chat.completions.create.side_effect = Exception("API timeout")

    res = client.post("/query", json={"query": "test"})
    assert res.status_code == 503
    assert "LLM request failed" in res.json()["detail"]


# --- /query/stream ---


@patch("backend.app.main.collection")
def test_query_stream_empty_collection(mock_col, client):
    mock_col.count.return_value = 0
    res = client.post("/query/stream", json={"query": "test"})
    assert res.status_code == 200
    assert "event: error" in res.text
    assert "No documents ingested yet" in res.text


@patch("backend.app.main.async_openai_client")
@patch("backend.app.main.collection")
def test_query_stream_success(mock_col, mock_openai, client):
    mock_col.count.return_value = 5
    mock_col.query.return_value = MOCK_QUERY_RESULTS

    token_chunk = MagicMock()
    token_chunk.choices = [MagicMock()]
    token_chunk.choices[0].delta.content = "Hello"
    end_chunk = MagicMock()
    end_chunk.choices = [MagicMock()]
    end_chunk.choices[0].delta.content = None

    async def async_stream():
        yield token_chunk
        yield end_chunk

    mock_openai.chat.completions.create = AsyncMock(return_value=async_stream())

    res = client.post("/query/stream", json={"query": "How do I onboard?"})
    assert res.status_code == 200
    assert "event: metadata" in res.text
    assert "onboarding.md" in res.text
    assert "event: token" in res.text
    assert "Hello" in res.text
    assert "event: done" in res.text


@patch("backend.app.main.collection")
def test_query_stream_vector_search_failure(mock_col, client):
    mock_col.count.return_value = 5
    mock_col.query.side_effect = Exception("ChromaDB error")

    res = client.post("/query/stream", json={"query": "test"})
    assert res.status_code == 200
    assert "event: error" in res.text
    assert "Vector search failed" in res.text


@patch("backend.app.main.async_openai_client")
@patch("backend.app.main.collection")
def test_query_stream_openai_failure(mock_col, mock_openai, client):
    mock_col.count.return_value = 5
    mock_col.query.return_value = MOCK_QUERY_RESULTS
    mock_openai.chat.completions.create = AsyncMock(side_effect=Exception("API timeout"))

    res = client.post("/query/stream", json={"query": "test"})
    assert res.status_code == 200
    assert "event: error" in res.text
    assert "LLM request failed" in res.text


# --- Retry with exponential backoff ---


def _make_rate_limit_error():
    """Construct an openai.RateLimitError with a minimal httpx response."""
    response = httpx.Response(
        status_code=429,
        request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"),
    )
    return openai.RateLimitError("Rate limit exceeded", response=response, body=None)


@patch("time.sleep")
@patch("backend.app.main.OPENAI_MAX_RETRIES", 3)
@patch("backend.app.main.openai_client")
@patch("backend.app.main.collection")
def test_query_retries_on_rate_limit_and_succeeds(mock_col, mock_openai, mock_sleep, client):
    mock_col.count.return_value = 5
    mock_col.query.return_value = MOCK_QUERY_RESULTS
    choice = MagicMock()
    choice.message.content = "Mocked answer."
    success = MagicMock(choices=[choice])
    mock_openai.chat.completions.create.side_effect = [_make_rate_limit_error(), success]

    res = client.post("/query", json={"query": "How do I onboard?"})

    assert res.status_code == 200
    assert res.json()["answer"] == "Mocked answer."
    assert mock_openai.chat.completions.create.call_count == 2
    assert mock_sleep.called


@patch("time.sleep")
@patch("backend.app.main.OPENAI_MAX_RETRIES", 2)
@patch("backend.app.main.openai_client")
@patch("backend.app.main.collection")
def test_query_exhausts_retries(mock_col, mock_openai, mock_sleep, client):
    mock_col.count.return_value = 5
    mock_col.query.return_value = MOCK_QUERY_RESULTS
    mock_openai.chat.completions.create.side_effect = _make_rate_limit_error()

    res = client.post("/query", json={"query": "test"})

    assert res.status_code == 503
    assert "LLM request failed" in res.json()["detail"]
    assert mock_openai.chat.completions.create.call_count == 2


@patch("asyncio.sleep", new_callable=AsyncMock)
@patch("backend.app.main.OPENAI_MAX_RETRIES", 3)
@patch("backend.app.main.async_openai_client")
@patch("backend.app.main.collection")
def test_query_stream_retries_on_rate_limit_and_succeeds(mock_col, mock_openai, mock_sleep, client):
    mock_col.count.return_value = 5
    mock_col.query.return_value = MOCK_QUERY_RESULTS

    token_chunk = MagicMock()
    token_chunk.choices = [MagicMock()]
    token_chunk.choices[0].delta.content = "Hello"
    end_chunk = MagicMock()
    end_chunk.choices = [MagicMock()]
    end_chunk.choices[0].delta.content = None

    async def async_stream():
        yield token_chunk
        yield end_chunk

    mock_openai.chat.completions.create = AsyncMock(
        side_effect=[_make_rate_limit_error(), async_stream()]
    )

    res = client.post("/query/stream", json={"query": "How do I onboard?"})

    assert res.status_code == 200
    assert "event: token" in res.text
    assert "Hello" in res.text
    assert mock_openai.chat.completions.create.call_count == 2
    assert mock_sleep.called


@patch("asyncio.sleep", new_callable=AsyncMock)
@patch("backend.app.main.OPENAI_MAX_RETRIES", 2)
@patch("backend.app.main.async_openai_client")
@patch("backend.app.main.collection")
def test_query_stream_exhausts_retries(mock_col, mock_openai, mock_sleep, client):
    mock_col.count.return_value = 5
    mock_col.query.return_value = MOCK_QUERY_RESULTS
    mock_openai.chat.completions.create = AsyncMock(side_effect=_make_rate_limit_error())

    res = client.post("/query/stream", json={"query": "test"})

    assert res.status_code == 200
    assert "event: error" in res.text
    assert "LLM request failed" in res.text
    assert mock_openai.chat.completions.create.call_count == 2

