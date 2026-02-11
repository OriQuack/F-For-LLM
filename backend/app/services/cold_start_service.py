"""
Cold-start service using Kennard-Stone algorithm.

Simplified from interface version — blocks only, no pairs.
"""

import numpy as np
import logging
import random
from typing import List, Optional
from sklearn.preprocessing import StandardScaler

from .data_service import DataService

logger = logging.getLogger(__name__)


class ColdStartService:
    """Diversity-based representative sampling for bootstrap."""

    def __init__(self, data_service: DataService):
        self.data_service = data_service

    async def get_suggestions(
        self, block_ids: List[int], num_suggestions: int = 10
    ) -> List[int]:
        """Select diverse block IDs using Kennard-Stone."""
        metrics_df = self.data_service.get_metrics(block_ids)
        metric_cols = self.data_service.metric_columns

        if metrics_df is None or len(metrics_df) == 0 or not metric_cols:
            return self._random_fallback(block_ids, num_suggestions)

        id_list = metrics_df["block_id"].to_list()
        matrix = np.column_stack([
            metrics_df[col].fill_null(0.0).to_numpy() for col in metric_cols
        ])

        scaler = StandardScaler()
        scaled = scaler.fit_transform(matrix)

        n_select = min(num_suggestions, len(id_list))
        indices = self._kennard_stone(scaled, n_select)

        selected = [id_list[i] for i in indices]
        logger.info(f"Kennard-Stone selected {len(selected)} diverse blocks")
        return selected

    def _kennard_stone(self, X: np.ndarray, n: int) -> List[int]:
        """Kennard-Stone: iteratively select max-min-distance points."""
        n_samples = X.shape[0]
        if n >= n_samples:
            return list(range(n_samples))

        dist = np.linalg.norm(X[:, np.newaxis] - X, axis=2)
        i, j = np.unravel_index(np.argmax(dist), dist.shape)
        selected = [int(i), int(j)]

        while len(selected) < n:
            min_dists = dist[selected].min(axis=0)
            min_dists[selected] = -1
            selected.append(int(np.argmax(min_dists)))

        return selected

    def _random_fallback(self, block_ids: List[int], n: int) -> List[int]:
        random.seed(42)
        return random.sample(block_ids, min(n, len(block_ids)))
