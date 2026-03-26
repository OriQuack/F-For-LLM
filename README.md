# Code Authorship Classifier

Interactive tool for labeling code blocks as human-written or LLM-generated using active learning (SVM + RF/MLP committee).

## Quick Start

### 1. Generate data

```bash
python -m pipeline.build_dataset \
  --languages python \
  --skip-codechef \
  --skip-aigcodeset \
  --humanvsai-limit-rows 2000
```

### 2. Start the backend

```bash
cd backend
pip install -r requirements.txt
python start.py
```

API runs at http://localhost:8004 (docs at http://localhost:8004/docs).

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at http://localhost:5173. The Vite dev server proxies `/api` requests to the backend.
