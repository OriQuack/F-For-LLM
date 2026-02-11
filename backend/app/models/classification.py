"""SVM classification models."""

from pydantic import BaseModel
from typing import List, Dict, Optional, Literal
from .common import HistogramData, HistogramStatistics


class WeightedBlockId(BaseModel):
    id: int
    source: Literal["click", "threshold"]


class CommitteeVoteInfo(BaseModel):
    svm_prediction: int
    rf_prediction: int
    mlp_prediction: int
    vote_entropy: float


class SimilarityHistogramRequest(BaseModel):
    selected_items: List[WeightedBlockId]
    rejected_items: List[WeightedBlockId]
    block_ids: List[int]


class SimilarityHistogramResponse(BaseModel):
    scores: Dict[str, float]
    histogram: HistogramData
    statistics: HistogramStatistics
    total_items: int
    committee_votes: Optional[Dict[str, CommitteeVoteInfo]] = None
