"""Block data models."""

from pydantic import BaseModel
from typing import List


class BlockInfo(BaseModel):
    block_id: int
    file_id: int
    file_path: str
    block_type: str
    block_name: str
    language: str
    start_line: int
    end_line: int


class BlockCodeResponse(BaseModel):
    block_id: int
    code: str
    language: str


class BlockListResponse(BaseModel):
    blocks: List[BlockInfo]
    metric_columns: List[str]
    total_blocks: int
