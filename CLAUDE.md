# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RAG (Retrieval Augmented Generation) Internal Docs Assistant — a tool for querying internal documentation using retrieval-augmented generation.

## Repository Structure

- `backend/` — FastAPI server and RAG pipeline (ingestion, embedding, retrieval, generation)
  - `backend/app/main.py` — FastAPI application entrypoint
- `frontend/` — User interface for interacting with the assistant

## Backend Development

```bash
# Activate the virtual environment
source backend/.venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Run the dev server (from repo root)
uvicorn backend.app.main:app --reload
```

The API runs at http://localhost:8000. Docs at http://localhost:8000/docs.

## Git Workflow

At the start of each session, sync remote state before doing any branch work:

```bash
git fetch --prune
```

This removes tracking refs for branches deleted on GitHub (e.g. after a PR merge with auto-delete enabled).

To see stale local branches that no longer have a remote counterpart:

```bash
git branch -vv | grep ': gone]'
```

To delete them:

```bash
git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -d
```

To check PR status without waiting for the user to report it:

```bash
gh pr list --state open           # open PRs
gh pr list --state merged         # recently merged PRs
gh pr view <number-or-branch>     # status of a specific PR
```
