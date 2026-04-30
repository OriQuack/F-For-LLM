"""Unsupervised feature filtering — compute variance and correlation stats for all columns."""

import numpy as np
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

logger = logging.getLogger(__name__)


@dataclass
class CorrelationPair:
    col_a: str
    col_b: str
    r: float


@dataclass
class FilterResult:
    surviving_columns: List[str]
    removed_low_variance: List[str]
    removed_correlated: List[Tuple[str, str]]  # (removed, kept_instead) — recommendations only
    original_count: int
    surviving_count: int
    variances: Dict[str, float] = field(default_factory=dict)
    means: Dict[str, float] = field(default_factory=dict)
    correlations: List[CorrelationPair] = field(default_factory=list)


def filter_features(
    column_names: List[str],
    matrix: np.ndarray,
    cv_threshold: float,
    correlation_threshold: float,
) -> FilterResult:
    """Compute variance and correlation stats for all features.

    All columns survive — nothing is removed. The removed_low_variance and
    removed_correlated fields are populated as recommendations only.

    Args:
        column_names: Feature names matching matrix columns.
        matrix: (n_samples, n_features) numeric array.
        cv_threshold: Columns with coefficient of variation (std / |mean|)
            below this are flagged. When |mean| ≈ 0, std is used directly so
            that columns clustered near zero are still caught.
        correlation_threshold: Pairs with |r| above this are flagged.

    Returns:
        FilterResult with all columns surviving plus stats metadata.
    """
    original_count = len(column_names)

    # Compute per-column variance and mean
    variances_arr = np.var(matrix, axis=0)
    means_arr = np.mean(matrix, axis=0)
    stds_arr = np.sqrt(variances_arr)
    variances = {name: float(v) for name, v in zip(column_names, variances_arr)}
    means = {name: float(m) for name, m in zip(column_names, means_arr)}

    # Coefficient of variation (scale-invariant). Fall back to std when |mean|
    # is near zero so that constant-zero columns are still flagged.
    abs_means = np.abs(means_arr)
    near_zero_mean = abs_means < 1e-10
    cv_arr = np.where(near_zero_mean, stds_arr, stds_arr / np.where(near_zero_mean, 1.0, abs_means))

    # Flag low-CV columns (recommendations only)
    removed_low_variance = [
        name for name, c in zip(column_names, cv_arr) if c < cv_threshold
    ]

    # Compute correlation pairs above threshold
    correlations: List[CorrelationPair] = []
    removed_correlated: List[Tuple[str, str]] = []

    if len(column_names) >= 2:
        corr = np.corrcoef(matrix, rowvar=False)
        corr = np.nan_to_num(corr, nan=0.0)

        n = len(column_names)
        for i in range(n):
            for j in range(i + 1, n):
                r = abs(corr[i, j])
                correlations.append(CorrelationPair(
                    col_a=column_names[i],
                    col_b=column_names[j],
                    r=round(float(r), 4),
                ))
                # Recommend dropping the lower-variance one (only above threshold)
                if r >= correlation_threshold:
                    if variances_arr[i] >= variances_arr[j]:
                        removed_correlated.append((column_names[j], column_names[i]))
                    else:
                        removed_correlated.append((column_names[i], column_names[j]))

    return FilterResult(
        surviving_columns=list(column_names),  # all columns survive
        removed_low_variance=removed_low_variance,
        removed_correlated=removed_correlated,
        original_count=original_count,
        surviving_count=original_count,
        variances=variances,
        means=means,
        correlations=correlations,
    )
