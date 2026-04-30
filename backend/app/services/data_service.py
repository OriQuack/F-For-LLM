"""Data service — loads blocks.parquet, metrics.parquet, and labels.parquet."""

import numpy as np
import polars as pl
import logging
from pathlib import Path
from typing import List, Optional

from .feature_filter import FilterResult, filter_features
from .constants import CV_THRESHOLD, CORRELATION_THRESHOLD, CLASSROOM_DATASET

logger = logging.getLogger(__name__)


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

        if CLASSROOM_DATASET is not None and self._labels_df is not None:
            scoped_ids = self._labels_df["block_id"].unique().to_list()
            before = len(self._blocks_df)
            self._blocks_df = self._blocks_df.filter(pl.col("block_id").is_in(scoped_ids))
            logger.info(
                f"Classroom dataset '{CLASSROOM_DATASET}': scoped blocks {before} -> {len(self._blocks_df)}"
            )

        if metrics_path.exists():
            self._metrics_lazy = pl.scan_parquet(metrics_path)
            if CLASSROOM_DATASET is not None and self._labels_df is not None:
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