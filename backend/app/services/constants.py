"""Shared constants for SVM training and feature filtering."""

CLICK_WEIGHT = 1.0
THRESHOLD_WEIGHT = 0.2

VARIANCE_THRESHOLD = 1e-4
CORRELATION_THRESHOLD = 0.95

# Set to "10", "25", "50", etc. to load data/output/classroom_{N}.parquet
# in place of labels.parquet (and scope blocks/metrics to that subset).
# None means use the full labels.parquet.
CLASSROOM_DATASET: str | None = "50"
