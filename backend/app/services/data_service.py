"""Data service — loads blocks.parquet, metrics.parquet, and labels.parquet."""

import numpy as np
import polars as pl
import logging
from pathlib import Path
from typing import List, Optional

from .feature_filter import FilterResult, filter_features
from .constants import (
    CV_THRESHOLD,
    CORRELATION_THRESHOLD,
    CLASSROOM_DATASET,
    BALANCED_PER_LABEL,
    BALANCED_SAMPLE_SEED,
)

logger = logging.getLogger(__name__)


def balanced_subset(
    labels_df: pl.DataFrame, n_per_label: int, seed: int
) -> pl.DataFrame:
    """Problem-stratified balanced sample.

    Picks `n_per_label` problems uniformly (seeded), then keeps every human block
    plus one randomly chosen LLM block from each picked problem. Result has
    `n_per_label` human and `n_per_label` LLM rows, all paired by `problem_id`.

    Raises if fewer than `n_per_label` problems have both human and LLM blocks.

    Mirrored by simulate_classroom.py's --balanced-per-label CLI arg; the two
    implementations must produce identical block-id sets for the same (n, seed).
    """
    rng = np.random.default_rng(seed)
    human = labels_df.filter(pl.col("label") == 0)
    llm = labels_df.filter(pl.col("label") == 1)
    problems_with_both = (
        human.select("problem_id").unique()
        .join(llm.select("problem_id").unique(), on="problem_id", how="inner")
        .get_column("problem_id")
        .to_list()
    )
    if len(problems_with_both) < n_per_label:
        raise RuntimeError(
            f"Need {n_per_label} problems with both human + LLM blocks, "
            f"have {len(problems_with_both)}"
        )
    problems_with_both.sort()  # deterministic order before shuffle
    picked = list(rng.choice(problems_with_both, size=n_per_label, replace=False))

    picked_set = set(picked)
    human_keep = human.filter(pl.col("problem_id").is_in(picked_set))
    if human_keep.height != n_per_label:
        # If a problem yields >1 human block, keep the lowest block_id (deterministic).
        human_keep = (
            human_keep.sort(["problem_id", "block_id"])
            .group_by("problem_id", maintain_order=True)
            .head(1)
        )
    llm_pool = llm.filter(pl.col("problem_id").is_in(picked_set))
    llm_groups = (
        llm_pool.sort(["problem_id", "block_id"])
        .group_by("problem_id")
        .agg(pl.col("block_id").alias("block_ids"))
        .sort("problem_id")  # deterministic iteration order
    )
    chosen_llm_ids = []
    for row in llm_groups.iter_rows(named=True):
        chosen_llm_ids.append(int(rng.choice(row["block_ids"])))
    llm_keep = llm_pool.filter(pl.col("block_id").is_in(chosen_llm_ids))
    return pl.concat([human_keep, llm_keep])


class DataService:
    """Loads and serves block, metric, and label data."""

    def __init__(self):
        self._blocks_df: Optional[pl.DataFrame] = None
        self._metrics_lazy: Optional[pl.LazyFrame] = None
        self._labels_df: Optional[pl.DataFrame] = None

        self._metric_columns: List[str] = []
        self._all_metric_columns: List[str] = []
        self._filter_result: Optional[FilterResult] = None
        self._ready = False

    async def initialize(self):
        """Load parquet files."""
        data_dir = Path(__file__).parent.parent.parent.parent / "data" / "output"

        blocks_path = data_dir / "blocks.parquet"
        metrics_path = data_dir / "metrics.parquet"
        if CLASSROOM_DATASET is not None:
            labels_path = data_dir / f"classroom_{CLASSROOM_DATASET}.parquet"
            if not labels_path.exists():
                raise FileNotFoundError(
                    f"CLASSROOM_DATASET='{CLASSROOM_DATASET}' but {labels_path} not found. "
                    f"Run: python pipeline/simulate_classroom.py"
                )
        else:
            labels_path = data_dir / "labels.parquet"

        if not blocks_path.exists():
            raise FileNotFoundError(f"blocks.parquet not found at {blocks_path}")

        self._blocks_df = pl.read_parquet(blocks_path)
        logger.info(f"Loaded {len(self._blocks_df)} blocks")

        if labels_path.exists():
            self._labels_df = pl.read_parquet(labels_path)
            logger.info(f"Loaded {len(self._labels_df)} labels from {labels_path.name}")
        else:
            logger.warning(f"{labels_path.name} not found — offline evaluation metadata unavailable")

        if (
            CLASSROOM_DATASET is None
            and BALANCED_PER_LABEL is not None
            and self._labels_df is not None
        ):
            before = len(self._labels_df)
            self._labels_df = balanced_subset(
                self._labels_df, BALANCED_PER_LABEL, BALANCED_SAMPLE_SEED
            )
            logger.info(
                f"Balanced subset (N={BALANCED_PER_LABEL} per label, seed={BALANCED_SAMPLE_SEED}): "
                f"labels {before} -> {len(self._labels_df)}"
            )

        if (CLASSROOM_DATASET is not None or BALANCED_PER_LABEL is not None) and self._labels_df is not None:
            scoped_ids = self._labels_df["block_id"].unique().to_list()
            before = len(self._blocks_df)
            self._blocks_df = self._blocks_df.filter(pl.col("block_id").is_in(scoped_ids))
            scope_tag = (
                f"classroom '{CLASSROOM_DATASET}'"
                if CLASSROOM_DATASET is not None
                else f"balanced (N={BALANCED_PER_LABEL})"
            )
            logger.info(
                f"{scope_tag}: scoped blocks {before} -> {len(self._blocks_df)}"
            )

        if metrics_path.exists():
            self._metrics_lazy = pl.scan_parquet(metrics_path)
            if (
                CLASSROOM_DATASET is not None or BALANCED_PER_LABEL is not None
            ) and self._labels_df is not None:
                scoped_ids = self._labels_df["block_id"].unique().to_list()
                self._metrics_lazy = self._metrics_lazy.filter(
                    pl.col("block_id").is_in(scoped_ids)
                )
            schema = pl.read_parquet_schema(metrics_path)
            all_cols = [c for c in schema if c != "block_id"]
            self._all_metric_columns = all_cols

            if all_cols:
                metrics_df = self._metrics_lazy.collect()
                matrix = np.column_stack([
                    metrics_df[col].fill_null(0.0).to_numpy().astype(float)
                    for col in all_cols
                ])
                self._filter_result = filter_features(
                    all_cols, matrix, CV_THRESHOLD, CORRELATION_THRESHOLD,
                )
                self._metric_columns = self._filter_result.surviving_columns
                logger.info(
                    f"Feature filter: {self._filter_result.original_count} -> "
                    f"{self._filter_result.surviving_count}"
                )
            else:
                self._metric_columns = []

            logger.info(f"Loaded metrics with columns: {self._metric_columns}")
        else:
            logger.warning("metrics.parquet not found — metric features unavailable")

        self._ready = True

    def is_ready(self) -> bool:
        return self._ready

    def get_all_blocks(self) -> pl.DataFrame:
        """Return block metadata without code column."""
        assert self._blocks_df is not None
        preferred_cols = [
            "block_id",
            "file_id",
            "file_path",
            "block_type",
            "block_name",
            "language",
            "start_line",
            "end_line",
        ]
        existing = [c for c in preferred_cols if c in self._blocks_df.columns]
        return self._blocks_df.select(existing)

    def get_block_code(self, block_id: int) -> Optional[str]:
        """Return code text for a single block."""
        assert self._blocks_df is not None
        row = self._blocks_df.filter(pl.col("block_id") == block_id)
        if len(row) == 0:
            return None
        return row["code"][0]

    def get_block_language(self, block_id: int) -> str:
        """Return language for a single block."""
        assert self._blocks_df is not None
        row = self._blocks_df.filter(pl.col("block_id") == block_id)
        if len(row) == 0:
            return "text"
        return row["language"][0]

    def get_metrics(self, block_ids: List[int]) -> Optional[pl.DataFrame]:
        """Return metrics DataFrame for given block IDs."""
        if self._metrics_lazy is None:
            return None
        return self._metrics_lazy.filter(
            pl.col("block_id").is_in(block_ids)
        ).collect()

    def get_labels(self, block_ids: List[int]) -> Optional[pl.DataFrame]:
        """Return labels DataFrame for given block IDs."""
        if self._labels_df is None:
            return None
        return self._labels_df.filter(pl.col("block_id").is_in(block_ids))

    @property
    def labels_df(self) -> Optional[pl.DataFrame]:
        return self._labels_df

    @property
    def blocks_df(self) -> Optional[pl.DataFrame]:
        return self._blocks_df

    @property
    def is_classroom(self) -> bool:
        return CLASSROOM_DATASET is not None

    @property
    def classroom_dataset(self) -> Optional[str]:
        return CLASSROOM_DATASET

    @property
    def metric_columns(self) -> List[str]:
        return self._metric_columns

    @property
    def all_metric_columns(self) -> List[str]:
        return self._all_metric_columns

    @property
    def filter_result(self) -> Optional[FilterResult]:
        return self._filter_result