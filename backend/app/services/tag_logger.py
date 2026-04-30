"""Incremental tag logger — appends one JSONL entry per classify call."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

import numpy as np
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

logger = logging.getLogger(__name__)


class TagLogger:
    def __init__(self, log_path: Path):
        self._path = log_path
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._iteration = self._read_last_iteration()

    def _read_last_iteration(self) -> int:
        if not self._path.exists():
            return 0
        try:
            # Read only the last non-empty line to avoid loading the whole file
            with open(self._path, "rb") as f:
                f.seek(0, 2)
                size = f.tell()
                if size == 0:
                    return 0
                # Scan back up to 512 bytes for the last line
                f.seek(max(0, size - 512))
                tail = f.read().decode(errors="replace")
            for line in reversed(tail.splitlines()):
                line = line.strip()
                if line:
                    return json.loads(line).get("iteration", 0)
        except Exception:
            pass
        return 0

    def log(self, request, scores_dict: Dict[str, float], data_service) -> None:
        n_click = sum(
            1 for item in list(request.selected_items) + list(request.rejected_items)
            if item.source == "click"
        )
        n_threshold = sum(
            1 for item in list(request.selected_items) + list(request.rejected_items)
            if item.source == "threshold"
        )

        acc, f1, prec, rec = self._compute_metrics(scores_dict, data_service)

        self._iteration += 1
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "iteration": self._iteration,
            "n_click": n_click,
            "n_threshold": n_threshold,
            "n_total_tagged": n_click + n_threshold,
            "n_scored": len(scores_dict),
            "accuracy": acc,
            "f1": f1,
            "precision": prec,
            "recall": rec,
        }

        try:
            with open(self._path, "a") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception as e:
            logger.warning(f"TagLogger: failed to write log entry: {e}")
            return

        logger.info(
            f"TagLogger iter={self._iteration} "
            f"click={n_click} threshold={n_threshold} "
            f"acc={acc:.3f} f1={f1:.3f}"
        )

    def _compute_metrics(
        self, scores_dict: Dict[str, float], data_service
    ) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
        if data_service.labels_df is None:
            return None, None, None, None

        block_ids = [int(k) for k in scores_dict]
        labels_df = data_service.get_labels(block_ids)
        if labels_df is None or len(labels_df) == 0:
            return None, None, None, None

        gt_map = {row["block_id"]: int(row["label"]) for row in labels_df.to_dicts()}

        y_true, y_pred = [], []
        for bid_str, score in scores_dict.items():
            bid = int(bid_str)
            if bid not in gt_map:
                continue
            y_true.append(gt_map[bid])
            y_pred.append(1 if score > 0 else 0)

        if len(y_true) < 2:
            return None, None, None, None

        y_true_arr = np.array(y_true)
        y_pred_arr = np.array(y_pred)
        return (
            round(float(accuracy_score(y_true_arr, y_pred_arr)), 4),
            round(float(f1_score(y_true_arr, y_pred_arr, zero_division=0)), 4),
            round(float(precision_score(y_true_arr, y_pred_arr, zero_division=0)), 4),
            round(float(recall_score(y_true_arr, y_pred_arr, zero_division=0)), 4),
        )
