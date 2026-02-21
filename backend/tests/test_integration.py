"""Integration tests for /retrieve, /query, and /query/stream.

Unlike the unit tests in test_main.py (which mock the ChromaDB collection),
these tests inject a real in-memory ChromaDB EphemeralClient collection so
that vector storage, similarity math, and query response parsing all execute
for real.  OpenAI LLM calls are still mocked.

Fixtures are defined in conftest.py.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_sse_events(text: str) -> list[dict]:
    """Parse a raw SSE response body into a list of {event, data} dicts."""
    events = []
    current: dict = {}
    for line in text.splitlines():
        if line.startswith("event:"):
            current["event"] = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            raw = line.split(":", 1)[1].strip()
            try:
                current["data"] = json.loads(raw)
            except json.JSONDecodeError:
                current["data"] = raw
        elif line == "" and current:
            events.append(current)
            current = {}
    if current:
        events.append(current)
    return events


def make_mock_completion(text: str) -> MagicMock:
    """Build a minimal mock for openai_client.chat.completions.create return value."""
    choice = MagicMock()
    choice.message.content = text
    return MagicMock(choices=[choice])


def make_async_stream(*tokens: str):
    """Async generator that yields mock LLM stream chunks, then a content=None terminator."""
    async def _stream():
        for token in tokens:
            chunk = MagicMock()
            chunk.choices = [MagicMock()]
            chunk.choices[0].delta.content = token
            yield chunk
        end = MagicMock()
        end.choices = [MagicMock()]
        end.choices[0].delta.content = None
        yield end
    return _stream()


# ---------------------------------------------------------------------------
# /retrieve integration tests
# ---------------------------------------------------------------------------

class TestRetrieveIntegration:

    def test_retrieve_returns_all_docs_with_default_top_k(self, integration_client):
        """Default top_k=5 with 3 docs in collection → returns all 3 results."""
        res = integration_client.post("/retrieve", json={"query": "how to install"})
        assert res.status_code == 200
        assert len(res.json()["results"]) == 3

    def test_retrieve_response_schema(self, integration_client):
        """Each result has doc_id (str), score (float in [0,1]), and text (str)."""
        res = integration_client.post("/retrieve", json={"query": "install"})
        assert res.status_code == 200
        for item in res.json()["results"]:
            assert isinstance(item["doc_id"], str)
            assert isinstance(item["score"], float)
            assert 0.0 <= item["score"] <= 1.0
            assert isinstance(item["text"], str)
            assert len(item["text"]) > 0

    def test_retrieve_top_k_honored(self, integration_client):
        """top_k=1 → exactly 1 result returned."""
        res = integration_client.post("/retrieve", json={"query": "install", "top_k": 1})
        assert res.status_code == 200
        assert len(res.json()["results"]) == 1

    def test_retrieve_top_k_capped_by_collection_size(self, integration_client):
        """top_k=20 (> 3 docs) is capped to the collection size (3)."""
        res = integration_client.post("/retrieve", json={"query": "install", "top_k": 20})
        assert res.status_code == 200
        assert len(res.json()["results"]) == 3

    def test_retrieve_doc_ids_contain_separator(self, integration_client):
        """All returned doc_ids follow the 'filename::index' format."""
        res = integration_client.post("/retrieve", json={"query": "install"})
        for item in res.json()["results"]:
            assert "::" in item["doc_id"], f"doc_id missing '::' separator: {item['doc_id']}"

    def test_retrieve_503_on_empty_collection(self, empty_integration_client):
        """Empty collection → 503 with descriptive error."""
        res = empty_integration_client.post("/retrieve", json={"query": "anything"})
        assert res.status_code == 503
        assert "No documents ingested" in res.json()["detail"]


# ---------------------------------------------------------------------------
# /query integration tests
# ---------------------------------------------------------------------------

class TestQueryIntegration:

    def test_query_response_schema(self, integration_client):
        """Response has answer (str), sources (list[str]), chunks (list)."""
        with patch("backend.app.main.openai_client") as mock_openai:
            mock_openai.chat.completions.create.return_value = make_mock_completion("ok")
            res = integration_client.post("/query", json={"query": "how to install"})

        assert res.status_code == 200
        data = res.json()
        assert isinstance(data["answer"], str)
        assert isinstance(data["sources"], list)
        assert isinstance(data["chunks"], list)

    def test_query_uses_real_retrieval(self, integration_client):
        """All 3 seeded doc_ids appear in chunks when top_k=5."""
        with patch("backend.app.main.openai_client") as mock_openai:
            mock_openai.chat.completions.create.return_value = make_mock_completion("ok")
            res = integration_client.post("/query", json={"query": "install", "top_k": 5})

        doc_ids = [c["doc_id"] for c in res.json()["chunks"]]
        assert "guide.md::chunk0" in doc_ids
        assert "guide.md::chunk1" in doc_ids
        assert "faq.md::chunk0" in doc_ids

    def test_query_sources_deduplicated(self, integration_client):
        """Two guide.md chunks → exactly one 'guide.md' in sources list."""
        with patch("backend.app.main.openai_client") as mock_openai:
            mock_openai.chat.completions.create.return_value = make_mock_completion("ok")
            res = integration_client.post("/query", json={"query": "install", "top_k": 5})

        sources = res.json()["sources"]
        assert sources.count("guide.md") == 1, f"Duplicate guide.md in sources: {sources}"
        assert "faq.md" in sources

    def test_query_sources_unique(self, integration_client):
        """No duplicate entries in the sources list."""
        with patch("backend.app.main.openai_client") as mock_openai:
            mock_openai.chat.completions.create.return_value = make_mock_completion("ok")
            res = integration_client.post("/query", json={"query": "install", "top_k": 5})

        sources = res.json()["sources"]
        assert len(sources) == len(set(sources)), f"Duplicate sources: {sources}"

    def test_query_answer_from_mocked_llm(self, integration_client):
        """The answer field contains exactly the mocked LLM response."""
        expected = "Install using pip install mypackage."
        with patch("backend.app.main.openai_client") as mock_openai:
            mock_openai.chat.completions.create.return_value = make_mock_completion(expected)
            res = integration_client.post("/query", json={"query": "how to install"})

        assert res.json()["answer"] == expected

    def test_query_top_k_limits_chunks(self, integration_client):
        """top_k=1 → exactly 1 chunk and 1 source returned."""
        with patch("backend.app.main.openai_client") as mock_openai:
            mock_openai.chat.completions.create.return_value = make_mock_completion("ok")
            res = integration_client.post("/query", json={"query": "install", "top_k": 1})

        data = res.json()
        assert len(data["chunks"]) == 1
        assert len(data["sources"]) == 1

    def test_query_503_on_empty_collection(self, empty_integration_client):
        """Empty collection → 503 before the LLM is called."""
        res = empty_integration_client.post("/query", json={"query": "anything"})
        assert res.status_code == 503
        assert "No documents ingested" in res.json()["detail"]


# ---------------------------------------------------------------------------
# /query/stream integration tests
# ---------------------------------------------------------------------------

class TestQueryStreamIntegration:

    def test_stream_event_order(self, integration_client):
        """Events arrive in order: metadata first, then token(s), then done last."""
        with patch("backend.app.main.async_openai_client") as mock_async:
            mock_async.chat.completions.create = AsyncMock(
                return_value=make_async_stream("Hello", " world")
            )
            res = integration_client.post("/query/stream", json={"query": "install"})

        assert res.status_code == 200
        types = [e["event"] for e in parse_sse_events(res.text)]
        assert types[0] == "metadata"
        assert "token" in types
        assert types[-1] == "done"
        first_token = next(i for i, t in enumerate(types) if t == "token")
        assert types.index("metadata") < first_token < types.index("done")

    def test_stream_metadata_payload(self, integration_client):
        """metadata event contains sources (list) and chunks (list with required keys)."""
        with patch("backend.app.main.async_openai_client") as mock_async:
            mock_async.chat.completions.create = AsyncMock(
                return_value=make_async_stream("ok")
            )
            res = integration_client.post("/query/stream", json={"query": "install"})

        events = parse_sse_events(res.text)
        meta = next(e for e in events if e["event"] == "metadata")
        data = meta["data"]
        assert isinstance(data["sources"], list)
        assert isinstance(data["chunks"], list)
        assert len(data["chunks"]) > 0
        for chunk in data["chunks"]:
            assert "doc_id" in chunk
            assert "score" in chunk
            assert "text" in chunk

    def test_stream_metadata_sources_deduplicated(self, integration_client):
        """Sources in the metadata event are deduplicated (one 'guide.md')."""
        with patch("backend.app.main.async_openai_client") as mock_async:
            mock_async.chat.completions.create = AsyncMock(
                return_value=make_async_stream("ok")
            )
            res = integration_client.post(
                "/query/stream", json={"query": "install", "top_k": 5}
            )

        events = parse_sse_events(res.text)
        meta = next(e for e in events if e["event"] == "metadata")
        sources = meta["data"]["sources"]
        assert sources.count("guide.md") == 1, f"Duplicate guide.md in sources: {sources}"

    def test_stream_token_events(self, integration_client):
        """Token events carry a 'text' key; count matches the non-None stream chunks."""
        with patch("backend.app.main.async_openai_client") as mock_async:
            mock_async.chat.completions.create = AsyncMock(
                return_value=make_async_stream("Hello", " world")
            )
            res = integration_client.post("/query/stream", json={"query": "install"})

        events = parse_sse_events(res.text)
        token_events = [e for e in events if e["event"] == "token"]
        assert len(token_events) == 2
        assert token_events[0]["data"]["text"] == "Hello"
        assert token_events[1]["data"]["text"] == " world"

    def test_stream_done_event_payload(self, integration_client):
        """done event data is an empty dict {}."""
        with patch("backend.app.main.async_openai_client") as mock_async:
            mock_async.chat.completions.create = AsyncMock(
                return_value=make_async_stream("ok")
            )
            res = integration_client.post("/query/stream", json={"query": "install"})

        events = parse_sse_events(res.text)
        done = next(e for e in events if e["event"] == "done")
        assert done["data"] == {}

    def test_stream_empty_collection_yields_error_event(self, empty_integration_client):
        """Empty collection → HTTP 200 with an SSE error event (not a 503)."""
        res = empty_integration_client.post("/query/stream", json={"query": "anything"})
        assert res.status_code == 200
        events = parse_sse_events(res.text)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert "No documents ingested" in error_events[0]["data"]["detail"]

    def test_stream_no_error_events_on_success(self, integration_client):
        """A successful stream contains no error events."""
        with patch("backend.app.main.async_openai_client") as mock_async:
            mock_async.chat.completions.create = AsyncMock(
                return_value=make_async_stream("ok")
            )
            res = integration_client.post("/query/stream", json={"query": "install"})

        events = parse_sse_events(res.text)
        assert [e for e in events if e["event"] == "error"] == []
