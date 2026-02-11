"""Shared response models."""

from pydantic import BaseModel
from typing import List


class HistogramData(BaseModel):
    bins: List[float]
    counts: List[int]
    bin_edges: List[float]


class HistogramStatistics(BaseModel):
    min: float
    max: float
    mean: float
    median: float
