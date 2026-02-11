"""
Binary SVM classification service for code authorship.

Simplified from interface version — binary only, no OvR, no multi-class.
"""

import numpy as np
import logging
import hashlib
from typing import List, Dict, Tuple, Optional
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler

from ..models.common import HistogramData
from ..models.classification import (
    SimilarityHistogramRequest,
    SimilarityHistogramResponse,
    WeightedBlockId,
    CommitteeVoteInfo,
)
from ..models.common import HistogramStatistics
from .committee_service import CommitteeService
from .constants import CLICK_WEIGHT, THRESHOLD_WEIGHT
from .data_service import DataService
from .svm_utils import train_svm_model, score_with_svm, build_similarity_histogram_response

logger = logging.getLogger(__name__)


class ClassificationService:
    """Binary SVM scoring for code blocks."""

    def __init__(self, data_service: DataService):
        self.data_service = data_service
        self.committee_service = CommitteeService()
        self._svm_cache: Dict[str, Tuple[SVC, StandardScaler]] = {}
        self._max_cache_size = 100

    def _extract_metrics(self, block_ids: List[int]) -> Optional[np.ndarray]:
        """Extract metric vectors for given block IDs. Returns (ids, matrix) or None."""
        metrics_df = self.data_service.get_metrics(block_ids)
        if metrics_df is None or len(metrics_df) == 0:
            return None

        metric_cols = self.data_service.metric_columns
        if not metric_cols:
            return None

        ids = metrics_df["block_id"].to_numpy()
        matrix = np.column_stack([
            metrics_df[col].fill_null(0.0).to_numpy() for col in metric_cols
        ])
        return ids, matrix

    async def get_similarity_score_histogram(
        self, request: SimilarityHistogramRequest
    ) -> SimilarityHistogramResponse:
        """Train SVM + committee, return histogram + votes."""
        if not self.data_service.is_ready():
            raise RuntimeError("DataService not ready")

        result = self._extract_metrics(request.block_ids)
        if result is None:
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0,
            )

        block_ids_arr, metrics_matrix = result

        # Build ID-to-weight mapping
        id_to_weight: Dict[int, float] = {}
        selected_ids = set()
        rejected_ids = set()
        for item in request.selected_items:
            selected_ids.add(item.id)
            id_to_weight[item.id] = CLICK_WEIGHT if item.source == "click" else THRESHOLD_WEIGHT
        for item in request.rejected_items:
            rejected_ids.add(item.id)
            id_to_weight[item.id] = CLICK_WEIGHT if item.source == "click" else THRESHOLD_WEIGHT

        # Partition indices
        sel_indices, rej_indices = [], []
        for i, bid in enumerate(block_ids_arr):
            bid_int = int(bid)
            if bid_int in selected_ids:
                sel_indices.append(i)
            elif bid_int in rejected_ids:
                rej_indices.append(i)

        if not sel_indices or not rej_indices:
            logger.warning("Need both selected and rejected items for SVM")
            return SimilarityHistogramResponse(
                scores={},
                histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
                statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
                total_items=0,
            )

        sel_vectors = metrics_matrix[sel_indices]
        rej_vectors = metrics_matrix[rej_indices]
        sel_weights = np.array([id_to_weight.get(int(block_ids_arr[i]), CLICK_WEIGHT) for i in sel_indices])
        rej_weights = np.array([id_to_weight.get(int(block_ids_arr[i]), CLICK_WEIGHT) for i in rej_indices])

        # Check cache
        cache_key = self._cache_key(request.selected_items, request.rejected_items)
        if cache_key in self._svm_cache:
            model, scaler = self._svm_cache[cache_key]
        else:
            model, scaler = train_svm_model(sel_vectors, rej_vectors, sel_weights, rej_weights)
            if len(self._svm_cache) >= self._max_cache_size:
                self._svm_cache.pop(next(iter(self._svm_cache)))
            self._svm_cache[cache_key] = (model, scaler)

        # Score all blocks
        scores = score_with_svm(model, scaler, metrics_matrix)
        scores_dict = {str(int(bid)): float(s) for bid, s in zip(block_ids_arr, scores)}

        # Train committee
        X_train = np.vstack([sel_vectors, rej_vectors])
        y_train = np.array([1] * len(sel_vectors) + [0] * len(rej_vectors))
        sample_weights = np.concatenate([sel_weights, rej_weights])

        rf, mlp, committee_scaler = self.committee_service.train_committee(
            X_train, y_train, sample_weights
        )

        committee_votes_response = None
        if rf is not None or mlp is not None:
            X_scaled = scaler.transform(metrics_matrix)
            preds = self.committee_service.predict_with_committee(
                X_scaled, scores, rf, mlp, committee_scaler
            )
            item_ids = [str(int(bid)) for bid in block_ids_arr]
            votes_dict = self.committee_service.get_vote_info_dict(item_ids, preds)
            committee_votes_response = {
                bid: CommitteeVoteInfo(
                    svm_prediction=info["svm_prediction"],
                    rf_prediction=info["rf_prediction"],
                    mlp_prediction=info["mlp_prediction"],
                    vote_entropy=info["vote_entropy"],
                )
                for bid, info in votes_dict.items()
            }

        return build_similarity_histogram_response(
            scores_dict, np.array(list(scores_dict.values())),
            len(scores_dict), committee_votes_response,
        )

    def _cache_key(self, selected: List[WeightedBlockId], rejected: List[WeightedBlockId]) -> str:
        sel = sorted([(i.id, i.source) for i in selected])
        rej = sorted([(i.id, i.source) for i in rejected])
        return hashlib.md5(f"{sel}_{rej}".encode()).hexdigest()
