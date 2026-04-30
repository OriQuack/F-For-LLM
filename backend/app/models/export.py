"""Export aggregation models."""

from typing import List, Optional
from pydantic import BaseModel


class BlockResult(BaseModel):
    block_id: int
    label: str           # "Human" | "LLM"
    source: str          # "click" | "threshold" | "predicted" | ""
    score: Optional[float] = None


class ExportRequest(BaseModel):
    block_results: List[BlockResult]


class BlockExportEntry(BaseModel):
    block_id: int
    block_name: str
    file_path: str
    language: str
    predicted_label: str
    source: str
    score: Optional[float]


class AssignmentExportEntry(BaseModel):
    assignment_id: int
    problem_id: Optional[str]
    sample_id: Optional[str]
    used_llm: Optional[bool]
    ai_model: Optional[str]
    blocks: List[BlockExportEntry]


class StudentExportEntry(BaseModel):
    student_id: int
    assignments: List[AssignmentExportEntry]


class ExportResponse(BaseModel):
    dataset: str
    n_students: int
    n_assignments: int
    students: List[StudentExportEntry]


class FlatBlockExportEntry(BlockExportEntry):
    ground_truth_label: Optional[int] = None
    problem_id: Optional[str] = None
    pair_id: Optional[str] = None
    sample_id: Optional[str] = None
    ai_model: Optional[str] = None
    generation_mode: Optional[str] = None
    source_dataset: Optional[str] = None


class FlatExportResponse(BaseModel):
    dataset: str
    n_blocks: int
    blocks: List[FlatBlockExportEntry]
