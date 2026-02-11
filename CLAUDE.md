# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Code authorship classifier — an interactive tool for labeling code blocks as human-written or LLM-generated using active learning. React frontend with a FastAPI/scikit-learn/PyTorch backend, data stored in Parquet format.

## Development Commands

### Data Setup (required before backend)
```bash
python pipeline/generate_mock.py   # Generate mock parquet files in data/output/
```

### Backend (Python, FastAPI)
```bash
cd backend
pip install -r requirements.txt
python start.py              # Starts API on port 8004
python start.py --reload     # Dev mode with auto-reload
```
API docs available at http://localhost:8004/docs

### Frontend (React, TypeScript, Vite)
```bash
cd frontend
npm install
npm run dev         # Vite dev server (proxies /api to backend:8004)
npm run build       # TypeScript check + production build
npm run lint        # ESLint
npm run typecheck   # TypeScript type checking only
```

## Architecture

### Three-Stage Active Learning Workflow
1. **Bootstrap** — Kennard-Stone diversity sampling selects initial representative code blocks
2. **Learn** — User labels blocks as Human/LLM; SVM trains on selections, committee (RF+MLP) votes on uncertainty
3. **Apply** — Thresholds auto-classify remaining blocks

### Backend (`backend/app/`)
- **`api/`** — FastAPI routers: `blocks.py` (GET block data), `classification.py` (POST similarity scoring), `cold_start.py` (POST Kennard-Stone suggestions)
- **`services/`** — Core ML logic:
  - `classification_service.py` — Orchestrates SVM training and committee voting
  - `svm_utils.py` — SVM with RBF kernel, LRU-cached models (keyed by selection hash), decision function scores
  - `committee_service.py` — Query by Committee: Random Forest + MLP ensemble, vote entropy for uncertainty
  - `pytorch_mlp.py` — sklearn-compatible MLP with sample weight support, early stopping
  - `cold_start_service.py` — Kennard-Stone max-min-distance diversity sampling
  - `data_service.py` — Loads/serves Parquet files via Polars LazyFrames
  - `constants.py` — `CLICK_WEIGHT=1.0`, `THRESHOLD_WEIGHT=0.2`
- **`models/`** — Pydantic request/response schemas
- Services initialize during FastAPI lifespan and are stored globally

### Frontend (`frontend/src/`)
- **State**: Single Zustand store (`store/index.ts`) — blocks, selections, histograms, thresholds, commit history, flip tracking
- **Components**: `ClassifierView` (layout), `DecisionMarginHistogram` (D3 visualization), `CodeBlockViewer` (PrismJS highlighting), `ThresholdPanel`/`ThresholdHandles` (draggable thresholds), `StageAccordion` (bootstrap/learn/apply stages)
- **Hooks**: Custom hooks for commit history, keyboard navigation, sorting/filtering, threshold preview, flip tracking
- **Styles**: Component-scoped CSS files in `styles/`

### Selection Sources and Weights
Selections have a `source` field: `'click'` (manual, weight 1.0), `'threshold'` (auto-applied, weight 0.2), or `'predicted'` (metadata only). Weights apply directly to SVM and MLP loss functions.

### API Endpoints
- `GET /api/blocks` — Block metadata + metric column names
- `GET /api/blocks/{id}/code` — Code content for a block
- `POST /api/similarity-score-histogram` — Train SVM, return scores/histogram/committee votes
- `POST /api/cold-start/representative` — Kennard-Stone diverse sample suggestions
- `GET /health` — Health check

### Data (`data/output/`)
- `blocks.parquet` — block_id, file_path, block_type, block_name, language, code, etc.
- `metrics.parquet` — block_id + numeric feature columns (e.g. avg_line_length, cyclomatic_complexity)
