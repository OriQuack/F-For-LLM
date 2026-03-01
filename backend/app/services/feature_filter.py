"""Unsupervised feature filtering — drop near-zero-variance and highly correlated columns."""

import numpy as np
import logging
from dataclasses import dataclass
from typing import List, Tuple

logger = logging.getLogger(__name__)


@dataclass
class FilterResult:
    surviving_columns: List[str]
    removed_low_variance: List[str]
    removed_correlated: List[Tuple[str, str]]  # (removed, kept_instead)
    original_count: int
    surviving_count: int


def filter_features(
    column_names: List[str],
    matrix: np.ndarray,
    variance_threshold: float,
    correlation_threshold: float,
) -> FilterResult:
    """Filter features by variance and pairwise correlation.

    Args:
        column_names: Feature names matching matrix columns.
        matrix: (n_samples, n_features) numeric array.
        variance_threshold: Drop columns with variance below this.
        correlation_threshold: For pairs with |r| above this, drop the lower-variance one.

    Returns:
        FilterResult with surviving columns and removal metadata.
    """
    original_count = len(column_names)

    # Phase 1: variance filter
    variances = np.var(matrix, axis=0)
    var_mask = variances >= variance_threshold
    removed_low_variance = [
        name for name, keep in zip(column_names, var_mask) if not keep
    ]

    surviving_names = [name for name, keep in zip(column_names, var_mask) if keep]
    surviving_vars = variances[var_mask]
    surviving_matrix = matrix[:, var_mask]

    if len(surviving_names) < 2:
        return FilterResult(
            surviving_columns=surviving_names,
            removed_low_variance=removed_low_variance,
            removed_correlated=[],
            original_count=original_count,
            surviving_count=len(surviving_names),
        )

    # Phase 2: correlation filter
    corr = np.corrcoef(surviving_matrix, rowvar=False)
    # Handle NaN (e.g. constant columns that slipped through)
    corr = np.nan_to_num(corr, nan=0.0)

    n = len(surviving_names)
    drop_indices: set = set()
    removed_correlated: List[Tuple[str, str]] = []

    for i in range(n):
        if i in drop_indices:
            continue
        for j in range(i + 1, n):
            if j in drop_indices:
                continue
            if abs(corr[i, j]) >= correlation_threshold:
                # Drop the one with lower variance
                if surviving_vars[i] >= surviving_vars[j]:
                    drop_indices.add(j)
                    removed_correlated.append((surviving_names[j], surviving_names[i]))
                else:
                    drop_indices.add(i)
                    removed_correlated.append((surviving_names[i], surviving_names[j]))
                    break  # i is dropped, stop checking its pairs

    final_columns = [
        name for idx, name in enumerate(surviving_names) if idx not in drop_indices
    ]

    return FilterResult(
        surviving_columns=final_columns,
        removed_low_variance=removed_low_variance,
        removed_correlated=removed_correlated,
        original_count=original_count,
        surviving_count=len(final_columns),
    )
