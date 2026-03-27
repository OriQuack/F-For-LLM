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


def compute_balanced_sample_weights(
    y: np.ndarray,
    sample_weights: np.ndarray,
) -> np.ndarray:
    """Compute sample weights that are balanced by weighted class mass.

    sklearn's class_weight='balanced' uses raw counts to balance classes,
    ignoring sample_weight. This creates bias when classes have different
    proportions of high/low-weight samples (e.g., click=1.0 vs threshold=0.2).

    This function balances using effective class mass instead:
        balanced_weight[i] = sample_weight[i] * total_mass / (n_classes * class_mass[c])
    where class_mass[c] = sum(sample_weight[j] for j where y[j] == c).

    Args:
        y: (N,) class labels
        sample_weights: (N,) per-sample weights

    Returns:
        (N,) balanced sample weights where total effective mass is equal per class
    """
    classes = np.unique(y)
    n_classes = len(classes)
    total_mass = np.sum(sample_weights)

    balanced = sample_weights.copy()
    for c in classes:
        mask = (y == c)
        class_mass = np.sum(sample_weights[mask])
        if class_mass > 0:
            balanced[mask] *= total_mass / (n_classes * class_mass)

    return balanced


def train_svm_model(
    selected_vectors: np.ndarray,
    rejected_vectors: np.ndarray,
    selected_weights: Optional[np.ndarray] = None,
    rejected_weights: Optional[np.ndarray] = None,
    scaler: Optional[StandardScaler] = None,
) -> Tuple[SVC, StandardScaler]:
    """Train binary SVM classifier with RBF kernel and optional sample weights.

    Args:
        selected_vectors: (N_pos, d) positive examples
        rejected_vectors: (N_neg, d) negative examples
        selected_weights: (N_pos,) sample weights for positive examples (default: all 1.0)
        rejected_weights: (N_neg,) sample weights for negative examples (default: all 1.0)
        scaler: Optional pre-fit StandardScaler (e.g., fit on full prediction pool).
                If None, fits a new scaler on training data.

    Returns:
        Tuple of (trained_model, fitted_scaler)
    """
    X = np.vstack([selected_vectors, rejected_vectors])
    y = np.array([1] * len(selected_vectors) + [0] * len(rejected_vectors))

    if selected_weights is None:
        selected_weights = np.ones(len(selected_vectors))
    if rejected_weights is None:
        rejected_weights = np.ones(len(rejected_vectors))
    sample_weights = np.concatenate([selected_weights, rejected_weights])

    # Balance by weighted class mass (not raw counts like sklearn's class_weight='balanced')
    sample_weights = compute_balanced_sample_weights(y, sample_weights)

    # Use pre-fit scaler if provided (fit on full prediction pool for stable statistics),
    # otherwise fit on training data
    scaler_provided = scaler is not None
    if scaler is None:
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
    else:
        X_scaled = scaler.transform(X)

    model = SVC(kernel="rbf", C=1.0, gamma="scale", probability=False)
    model.fit(X_scaled, y, sample_weight=sample_weights)

    scaler_msg = "pre-fit scaler (full prediction pool)" if scaler_provided else f"scaler fit on {len(X)} training samples"
    logger.info(
        f"SVM trained: {len(selected_vectors)} pos, {len(rejected_vectors)} neg, "
        f"{model.n_support_.sum()} SVs, {scaler_msg}"
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
    feature_importances: Optional[Dict[str, float]] = None,
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
        feature_importances=feature_importances,
    )
