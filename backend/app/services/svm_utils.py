"""
Shared SVM utility functions for similarity scoring.

Adapted from interface/backend/app/services/svm_utils.py.
"""

import numpy as np
import logging
from typing import Dict, Tuple, Optional

from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler

from ..models.common import HistogramData
from ..models.classification import (
    SimilarityHistogramResponse,
    CommitteeVoteInfo,
)
from ..models.common import HistogramStatistics

logger = logging.getLogger(__name__)


def train_svm_model(
    selected_vectors: np.ndarray,
    rejected_vectors: np.ndarray,
    selected_weights: Optional[np.ndarray] = None,
    rejected_weights: Optional[np.ndarray] = None,
) -> Tuple[SVC, StandardScaler]:
    """Train binary SVM classifier with RBF kernel and optional sample weights."""
    X = np.vstack([selected_vectors, rejected_vectors])
    y = np.array([1] * len(selected_vectors) + [0] * len(rejected_vectors))

    if selected_weights is None:
        selected_weights = np.ones(len(selected_vectors))
    if rejected_weights is None:
        rejected_weights = np.ones(len(rejected_vectors))
    sample_weights = np.concatenate([selected_weights, rejected_weights])

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = SVC(kernel="rbf", C=1.0, gamma="scale", class_weight="balanced")
    model.fit(X_scaled, y, sample_weight=sample_weights)

    logger.info(
        f"SVM trained: {len(selected_vectors)} pos, {len(rejected_vectors)} neg, "
        f"{model.n_support_.sum()} SVs"
    )
    return model, scaler


def score_with_svm(
    model: SVC, scaler: StandardScaler, feature_vectors: np.ndarray
) -> np.ndarray:
    """Score using SVM decision function (positive = selected side)."""
    X_scaled = scaler.transform(feature_vectors)
    return model.decision_function(X_scaled)


def build_similarity_histogram_response(
    scores_dict: Dict[str, float],
    score_values: np.ndarray,
    total_items: int,
    committee_votes: Optional[Dict[str, CommitteeVoteInfo]] = None,
) -> SimilarityHistogramResponse:
    """Build histogram response from raw scores."""
    if len(score_values) == 0:
        return SimilarityHistogramResponse(
            scores={},
            histogram=HistogramData(bins=[], counts=[], bin_edges=[]),
            statistics=HistogramStatistics(min=0.0, max=0.0, mean=0.0, median=0.0),
            total_items=0,
        )

    counts, bin_edges = np.histogram(score_values, bins=60)
    bins = (bin_edges[:-1] + bin_edges[1:]) / 2

    statistics = HistogramStatistics(
        min=float(np.min(score_values)),
        max=float(np.max(score_values)),
        mean=float(np.mean(score_values)),
        median=float(np.median(score_values)),
    )

    return SimilarityHistogramResponse(
        scores=scores_dict,
        histogram=HistogramData(
            bins=bins.tolist(), counts=counts.tolist(), bin_edges=bin_edges.tolist()
        ),
        statistics=statistics,
        total_items=total_items,
        committee_votes=committee_votes,
    )
