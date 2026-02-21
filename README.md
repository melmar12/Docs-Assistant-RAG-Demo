# RAG Internal Docs Assistant

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://rag-docs-frontend-tq88.onrender.com/)

A retrieval-augmented generation (RAG) tool for querying internal documentation. Ask natural-language questions and get answers grounded in your company docs, with source citations.

## Prerequisites

- Python 3.10+
- Node.js 18+
- An [OpenAI API key](https://platform.openai.com/api-keys)

## Project Structure

```
├── backend/          # FastAPI server and RAG pipeline
│   ├── app/              # API endpoints (main.py) and ingestion (ingest.py)
│   ├── docs/             # Markdown documentation files (knowledge base)
│   ├── chroma_db/        # Vector database (created after ingestion)
│   └── eval.py           # Retrieval evaluation script
└── frontend/         # React + TypeScript UI (Vite + Vitest + MSW)
    └── src/
        └── components/   # UI components
```

## Setup

### 1. Backend

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:

```bash
echo "OPENAI_API_KEY=your-api-key-here" > .env
```

### 2. Ingest documents

Run the ingestion script to chunk the markdown files in `backend/docs/` and store their embeddings in ChromaDB:

```bash
cd backend
python3 -m app.ingest
```

This only needs to be run once, or again when the documents in `backend/docs/` change.

### 3. Frontend

```bash
cd frontend
npm install
```

## Running the Application

Start both the backend and frontend:

```bash
# Terminal 1 — Backend (from the repo root)
source backend/.venv/bin/activate
uvicorn backend.app.main:app --reload
```

```bash
# Terminal 2 — Frontend
cd frontend
npm run dev
```

- Backend API: http://localhost:8000
- Frontend UI: http://localhost:5173
- API docs (Swagger): http://localhost:8000/docs

Open http://localhost:5173 in your browser and start asking questions about your docs.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/query` | Ask a question (retrieval + generation) |
| POST | `/retrieve` | Raw semantic search over document chunks |
| POST | `/debug-query` | Diagnostic view of retrieval results |
| GET | `/api/docs` | List all available documentation filenames |
| GET | `/api/docs/{filename}` | Get raw markdown content of a document |

## Running Frontend Tests

```bash
cd frontend
npm test
```

## Running the Evaluation

With the backend running, execute the retrieval evaluation script:

```bash
source backend/.venv/bin/activate
python backend/eval.py
```

This runs test questions against the `/retrieve` endpoint and prints a Precision@5 results table.

## How It Works

1. **Ingestion** — Markdown files are split into chunks by heading boundaries and stored as embeddings (OpenAI `text-embedding-3-small`) in a local ChromaDB vector database.
2. **Retrieval** — When a query comes in, it's embedded and matched against stored chunks using semantic similarity search.
3. **Generation** — The top matching chunks are passed as context to OpenAI `gpt-4o-mini`, which generates an answer grounded in the retrieved content.
