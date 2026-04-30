"""Shared constants for SVM training and feature filtering."""

CLICK_WEIGHT = 1.0
THRESHOLD_WEIGHT = 0.2

# Coefficient of variation (std / |mean|) — scale-invariant low-variation flag.
# 0.01 ≈ "values vary by less than 1% of their mean" → essentially constant.
CV_THRESHOLD = 0.01
CORRELATION_THRESHOLD = 0.85

# Set to "10", "25", "50", etc. to load data/output/classroom_{N}.parquet
# in place of labels.parquet (and scope blocks/metrics to that subset).
# None means use the full labels.parquet.
CLASSROOM_DATASET: str | None = None

# Balanced subset of labels.parquet, applied during DataService.initialize() when
# CLASSROOM_DATASET is None. Problem-stratified sampling: picks N problems, then
# keeps 1 human block + 1 random LLM block per problem (total = 2N blocks, all
# paired). None = use the full labels.parquet unchanged.
#
# This must be kept in sync with the input pool used by simulate_classroom.py.
# After changing BALANCED_PER_LABEL, regenerate the classroom files via:
#   python pipeline/simulate_classroom.py --balanced-per-label <N> --seed <SEED>
BALANCED_PER_LABEL: int | None = 500
BALANCED_SAMPLE_SEED: int = 42
