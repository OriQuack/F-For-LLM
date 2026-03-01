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
1. **Prototype** (bootstrap) — Kennard-Stone diversity sampling selects initial representative code blocks
2. **Uncertainty** (learn) — User labels blocks as Human/LLM; SVM trains on selections, committee (RF+MLP) votes on uncertainty
3. **Disagreement** (apply) — Thresholds auto-classify remaining blocks

### Backend (`backend/app/`)
- **`api/`** — FastAPI routers: `blocks.py` (GET block data + feature filter stats), `classification.py` (POST similarity scoring), `cold_start.py` (POST Kennard-Stone suggestions)
- **`services/`** — Core ML logic:
  - `classification_service.py` — Orchestrates SVM training and committee voting; supports per-request feature subset selection via `selected_features`
  - `svm_utils.py` — SVM with RBF kernel, LRU-cached models (keyed by selection hash), decision function scores
  - `committee_service.py` — Query by Committee: Random Forest + MLP ensemble, vote entropy for uncertainty; extracts feature importances from RF
  - `pytorch_mlp.py` — sklearn-compatible MLP with sample weight support, early stopping
  - `cold_start_service.py` — Kennard-Stone max-min-distance diversity sampling
  - `data_service.py` — Loads/serves Parquet files via Polars LazyFrames; runs feature filtering on init, stores both `all_metric_columns` (original) and `metric_columns` (filtered)
  - `feature_filter.py` — Unsupervised feature filtering: flags low-variance and highly-correlated columns as recommendations (does not remove them); thresholds configurable
  - `constants.py` — `CLICK_WEIGHT=1.0`, `THRESHOLD_WEIGHT=0.2`, `VARIANCE_THRESHOLD=1e-4`, `CORRELATION_THRESHOLD=0.95`
- **`models/`** — Pydantic request/response schemas (BlockListResponse includes `all_metric_columns` and `filter_summary`; SimilarityHistogramResponse includes `feature_importances`)
- Services initialize during FastAPI lifespan and are stored globally

### Frontend (`frontend/src/`)
- **State**: Single Zustand store (`store/index.ts`) — blocks, selections, histograms, thresholds, commit history, flip tracking, `enabledFeatures` (user-selected feature subset), `featureImportances`, `featureImportanceHistory`, `filterSummary`, `showDisagreementOnly`
- **Components**: `ClassifierView` (layout), `DecisionMarginHistogram` (D3 visualization), `CodeBlockViewer` (PrismJS highlighting), `ThresholdPanel`/`ThresholdHandles` (draggable thresholds), `StageAccordion` (stage navigation with "Hide tagged" and "Disagreement only" filters), `MetricPickerPanel` (feature selection with importance bars, variance stats, correlation matrix), `CorrelationMatrix` (interactive pairwise correlation heatmap), `ConvergenceIndicator`, `SelectionPanel` (selection summary + SelectionBar)
- **Hooks**: `useBoundaryItems`, `useThresholdPreview`, `useFlipTracking`, `useResizeObserver`
- **Styles**: Component-scoped CSS files in `styles/`

### Feature Filtering and Selection
On startup, `feature_filter.py` analyzes all metric columns for low variance and high pairwise correlation, producing recommendations. The frontend receives both all original columns and filter stats via `GET /api/blocks`. Users can enable/disable individual features in `MetricPickerPanel`; enabled features are sent as `selectedFeatures` to `POST /api/similarity-score-histogram`. Feature importances (from RF) are tracked across iterations for rank-change visualization.

### Selection Sources and Weights
Selections have a `source` field: `'click'` (manual, weight 1.0), `'threshold'` (auto-applied, weight 0.2), or `'predicted'` (metadata only). Weights apply directly to SVM and MLP loss functions.

### API Endpoints
- `GET /api/blocks` — Block metadata, metric column names, `all_metric_columns`, `filter_summary` (variance/correlation stats)
- `GET /api/blocks/{id}/code` — Code content for a block
- `POST /api/similarity-score-histogram` — Train SVM, return scores/histogram/committee votes/feature importances; accepts optional `selectedFeatures` list
- `POST /api/cold-start/representative` — Kennard-Stone diverse sample suggestions
- `GET /health` — Health check

### Data (`data/output/`)
- `blocks.parquet` — block_id, file_path, block_type, block_name, language, code, etc.
- `metrics.parquet` — block_id + numeric feature columns (e.g. avg_line_length, cyclomatic_complexity)
