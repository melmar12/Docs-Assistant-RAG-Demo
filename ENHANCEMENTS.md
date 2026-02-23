# Enhancement Backlog

Recommendations for improving the Docs Assistant RAG Demo over time, organized by effort and priority.

---

## Quick Wins

Low effort, high impact. Good starting points.

- [x] **Streaming LLM responses** — Stream the answer token-by-token via SSE instead of waiting for the full response. Biggest UX improvement for perceived speed; directly extends the loading spinner work.
- [x] **Copy-to-clipboard button** on `AnswerCard` — Let users easily copy answers.
- [x] **"Try Again" button** on failed queries — Currently there's no retry path after an error.
- [x] **ARIA labels on collapsible panels** — Sources and Chunks panels use `+`/`−` symbols with no accessible label; screen readers can't describe them.
- [x] **`env.example` file** — Provide a template showing required environment variables so setup is self-documenting.
- [x] **GitHub Actions CI** — Run `vitest` automatically on every PR. The test suite exists but there's no automation enforcing it.

---

## Medium Priority

Worth doing once quick wins are in place.

### Reliability & Observability
- [x] **Structured logging in the backend** — Add JSON-structured logs for queries, retrieval results, latency, and errors. Currently there's no visibility into what's happening in production.
- [ ] **Retry with exponential backoff for OpenAI calls** — Transient quota/rate errors currently surface as uncaught 500s.
- [ ] **Incremental document ingestion** — The current pipeline deletes and recreates the entire ChromaDB collection on every run, causing downtime. Switch to upsert-only.

### Test Coverage
- [x] **Frontend component tests** — `QueryInput`, `AnswerCard`, `SourcesPanel`, `ChunksPanel`, and `DocBrowser` have no unit tests. The MSW + Vitest setup is already in place.
- [x] **Backend unit tests for ingestion** — The chunk-splitting logic in `backend/app/ingest.py` is the most complex code in the repo and has zero test coverage.
- [x] **Backend integration tests** — Test the `/query` and `/retrieve` endpoints with a real (test) ChromaDB instance.

### Features
- [ ] **User feedback on answers** (thumbs up/down) — Closes the loop on RAG quality. Without this there's no signal on whether answers are actually good.
- [ ] **Query history in session** — Let users revisit previous questions within the same browser session using `sessionStorage`.
- [ ] **Relevance threshold filtering** — Currently all top-5 retrieved chunks go to the LLM regardless of score. Filter out low-confidence chunks to reduce noise in the context.

---

## Larger Investments

Higher effort; worthwhile before scaling up usage.

### Performance
- [ ] **Query result caching** — Identical questions currently hit OpenAI every time. A short-TTL in-memory or Redis cache would cut latency and API costs significantly.
- [ ] **Dynamic top-k retrieval** — Select the number of retrieved chunks based on query complexity rather than always using a fixed k=5.

### Multi-user / Production Readiness
- [ ] **Authentication** — The app is fully open. Adding even a simple API key or OAuth layer (e.g. GitHub OAuth via Render) makes it safe for internal deployment.
- [ ] **Rate limiting tuning** — The current limits (10 req/min for `/query`) may be too loose or too tight depending on team size; make them configurable.
- [ ] **Admin UI for document management** — Adding or updating docs currently requires SSH access and a manual ingestion run. A simple upload form would make this accessible to non-engineers.
- [ ] **Database backups** — ChromaDB data lives on the Render disk; add periodic backups to object storage (e.g. S3 or Render Disk snapshots).

### Accessibility
- [ ] **Full a11y audit** — Verify WCAG 2.1 AA compliance: color contrast in dark mode, keyboard navigation, focus management in the mobile drawer, alt text on any images.

---

## Completed

- [x] Loading spinner on Ask button with "Asking..." text and disabled state during in-flight queries
- [x] Test coverage for loading state (deferred MSW promise pattern)
