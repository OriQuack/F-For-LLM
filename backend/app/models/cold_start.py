"""Cold start models."""

from pydantic import BaseModel
from typing import List


class ColdStartRequest(BaseModel):
    block_ids: List[int]
    num_suggestions: int = 10


class ColdStartResponse(BaseModel):
    suggestion_ids: List[int]
