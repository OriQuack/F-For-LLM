"""
Cold-start service using TypiClust algorithm.

Selects representative samples via KMeans clustering + KNN typicality
scoring to bootstrap active learning when no labels exist yet.
"""

import numpy as np
import logging
import random
from typing import List
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.neighbors import NearestNeighbors

from .data_service import DataService

logger = logging.getLogger(__name__)


class ColdStartService:
    """TypiClust-based representative sampling for bootstrap."""

    def __init__(self, data_service: DataService):
        self.data_service = data_service

    async def get_suggestions(
        self, block_ids: List[int], num_suggestions: int = 30
    ) -> List[int]:
        """Select diverse block IDs using TypiClust."""
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
        indices = self._typiclust(scaled, n_select, k_nn=10)

        selected = [id_list[i] for i in indices]
        logger.info(f"TypiClust selected {len(selected)} diverse blocks")
        return selected

    def _typiclust(self, X: np.ndarray, n: int, k_nn: int = 7) -> List[int]:
        """
        TypiClust: KMeans clustering + KNN typicality scoring.

        Selects the most "typical" (densely surrounded) sample from each
        cluster. Clusters smaller than 5 fall back to nearest-to-centroid.

        Args:
            X: Data matrix (n_samples, n_features), should be pre-scaled
            n: Number of samples to select (= number of clusters)
            k_nn: Max nearest neighbors for typicality (adapted per cluster:
                  min(k_nn, cluster_size - 1))

        Returns:
            List of selected sample indices
        """
        n_samples = X.shape[0]
        if n >= n_samples:
            return list(range(n_samples))

        km = KMeans(n_clusters=n, init='k-means++', n_init=10, random_state=42)
        labels = km.fit_predict(X)

        selected: List[int] = []
        for c in range(n):
            cluster_mask = np.where(labels == c)[0]
            if len(cluster_mask) == 0:
                continue

            cluster_size = len(cluster_mask)
            typicality = np.empty(0)

            if cluster_size < 5:
                # Small cluster fallback: nearest to centroid
                dists = np.linalg.norm(X[cluster_mask] - km.cluster_centers_[c], axis=1)
                best_local = int(np.argmin(dists))
                idx = int(cluster_mask[best_local])
                use_typicality = False
            else:
                # Adaptive k: min(k_nn, cluster_size - 1)
                k = min(k_nn, cluster_size - 1)
                cluster_points = X[cluster_mask]
                nn = NearestNeighbors(n_neighbors=k + 1, metric='euclidean')
                nn.fit(cluster_points)
                distances, _ = nn.kneighbors(cluster_points)
                mean_dists = distances[:, 1:].mean(axis=1)  # exclude self
                typicality = 1.0 / (mean_dists + 1e-10)
                best_local = int(np.argmax(typicality))
                idx = int(cluster_mask[best_local])
                use_typicality = True

            # Avoid duplicates
            if idx in selected:
                if use_typicality:
                    order = np.argsort(-typicality)
                    for alt in order:
                        alt_idx = int(cluster_mask[alt])
                        if alt_idx not in selected:
                            idx = alt_idx
                            break
                else:
                    dists = np.linalg.norm(X[cluster_mask] - km.cluster_centers_[c], axis=1)
                    order = np.argsort(dists)
                    for alt in order:
                        alt_idx = int(cluster_mask[alt])
                        if alt_idx not in selected:
                            idx = alt_idx
                            break

            selected.append(idx)

        return selected

    def _random_fallback(self, block_ids: List[int], n: int) -> List[int]:
        random.seed(42)
        return random.sample(block_ids, min(n, len(block_ids)))
