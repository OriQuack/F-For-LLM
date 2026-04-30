"""Cold start models."""

from pydantic import BaseModel
from typing import List, Optional


class ColdStartRequest(BaseModel):
    block_ids: List[int]
    num_suggestions: int = 30
    selected_features: Optional[List[str]] = None


class ColdStartResponse(BaseModel):
    suggestion_ids: List[int]
