"""Data service — loads blocks.parquet and metrics.parquet."""

import polars as pl
import logging
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)


class DataService:
    """Loads and serves block and metric data."""

    def __init__(self):
        self._blocks_df: Optional[pl.DataFrame] = None
        self._metrics_lazy: Optional[pl.LazyFrame] = None
        self._metric_columns: List[str] = []
        self._ready = False

    async def initialize(self):
        """Load parquet files."""
        data_dir = Path(__file__).parent.parent.parent.parent / "data" / "output"

        blocks_path = data_dir / "blocks.parquet"
        metrics_path = data_dir / "metrics.parquet"

        if not blocks_path.exists():
            raise FileNotFoundError(f"blocks.parquet not found at {blocks_path}")

        self._blocks_df = pl.read_parquet(blocks_path)
        logger.info(f"Loaded {len(self._blocks_df)} blocks")

        if metrics_path.exists():
            self._metrics_lazy = pl.scan_parquet(metrics_path)
            # Discover metric columns (all except block_id)
            schema = pl.read_parquet_schema(metrics_path)
            self._metric_columns = [c for c in schema if c != "block_id"]
            logger.info(f"Loaded metrics with columns: {self._metric_columns}")
        else:
            logger.warning("metrics.parquet not found — metric features unavailable")

        self._ready = True

    def is_ready(self) -> bool:
        return self._ready

    def get_all_blocks(self) -> pl.DataFrame:
        """Return block metadata (without code column for list performance)."""
        assert self._blocks_df is not None
        cols = [c for c in self._blocks_df.columns if c != "code"]
        return self._blocks_df.select(cols)

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

    @property
    def metric_columns(self) -> List[str]:
        return self._metric_columns
