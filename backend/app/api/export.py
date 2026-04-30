"""Export aggregation endpoint."""

from collections import defaultdict
from typing import Union
from fastapi import APIRouter, HTTPException

from ..models.export import (
    ExportRequest,
    ExportResponse,
    StudentExportEntry,
    AssignmentExportEntry,
    BlockExportEntry,
    FlatBlockExportEntry,
    FlatExportResponse,
)
from ..services.constants import BALANCED_PER_LABEL

router = APIRouter()

_data_service = None


def set_data_service(ds):
    global _data_service
    _data_service = ds


@router.post(
    "/export/classroom",
    response_model=Union[ExportResponse, FlatExportResponse],
)
async def export_classroom(request: ExportRequest):
    if _data_service is None or not _data_service.is_ready():
        raise HTTPException(status_code=503, detail="Service not ready")

    labels = _data_service.labels_df
    blocks = _data_service.blocks_df
    if labels is None or blocks is None:
        raise HTTPException(status_code=500, detail="Data not loaded")

    if not _data_service.is_classroom:
        return _build_flat_export(request, labels, blocks)

    results_by_id = {r.block_id: r for r in request.block_results}

    block_meta = {
        row["block_id"]: row
        for row in blocks.select(
            ["block_id", "block_name", "file_path", "language"]
        ).to_dicts()
    }

    grouped: dict[int, dict[int, dict]] = defaultdict(dict)
    for row in labels.to_dicts():
        bid = row["block_id"]
        student_id = row["student_id"]
        assignment_id = row["assignment_id"]

        cell = grouped[student_id].setdefault(
            assignment_id,
            {
                "problem_id": row.get("problem_id"),
                "sample_id": row.get("sample_id"),
                "used_llm": row.get("used_llm"),
                "ai_model": row.get("ai_model"),
                "blocks": [],
            },
        )

        result = results_by_id.get(bid)
        meta = block_meta.get(bid, {})
        cell["blocks"].append(
            BlockExportEntry(
                block_id=bid,
                block_name=meta.get("block_name", ""),
                file_path=meta.get("file_path", ""),
                language=meta.get("language", ""),
                predicted_label=result.label if result else "",
                source=result.source if result else "",
                score=result.score if result else None,
            )
        )

    students = []
    for student_id in sorted(grouped.keys()):
        assignments = []
        for assignment_id in sorted(grouped[student_id].keys()):
            cell = grouped[student_id][assignment_id]
            assignments.append(
                AssignmentExportEntry(
                    assignment_id=assignment_id,
                    problem_id=cell["problem_id"],
                    sample_id=cell["sample_id"],
                    used_llm=cell["used_llm"],
                    ai_model=cell["ai_model"],
                    blocks=cell["blocks"],
                )
            )
        students.append(
            StudentExportEntry(student_id=student_id, assignments=assignments)
        )

    n_assignments = labels.select("assignment_id").n_unique()

    return ExportResponse(
        dataset=f"classroom_{_data_service.classroom_dataset}",
        n_students=len(students),
        n_assignments=n_assignments,
        students=students,
    )


def _build_flat_export(request, labels, blocks) -> FlatExportResponse:
    results_by_id = {r.block_id: r for r in request.block_results}

    block_meta = {
        row["block_id"]: row
        for row in blocks.select(
            ["block_id", "block_name", "file_path", "language"]
        ).to_dicts()
    }

    label_meta = {row["block_id"]: row for row in labels.to_dicts()}

    entries: list[FlatBlockExportEntry] = []
    for bid in sorted(label_meta.keys()):
        result = results_by_id.get(bid)
        meta = block_meta.get(bid, {})
        lrow = label_meta.get(bid, {})
        entries.append(
            FlatBlockExportEntry(
                block_id=bid,
                block_name=meta.get("block_name", ""),
                file_path=meta.get("file_path", ""),
                language=meta.get("language", "") or lrow.get("language", ""),
                predicted_label=result.label if result else "",
                source=result.source if result else "",
                score=result.score if result else None,
                ground_truth_label=lrow.get("label"),
                problem_id=lrow.get("problem_id"),
                pair_id=lrow.get("pair_id"),
                sample_id=lrow.get("sample_id"),
                ai_model=lrow.get("ai_model"),
                generation_mode=lrow.get("generation_mode"),
                source_dataset=lrow.get("dataset"),
            )
        )

    dataset_tag = (
        f"balanced_{BALANCED_PER_LABEL}" if BALANCED_PER_LABEL is not None else "full"
    )
    return FlatExportResponse(
        dataset=dataset_tag,
        n_blocks=len(entries),
        blocks=entries,
    )
