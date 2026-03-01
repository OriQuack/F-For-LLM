"""Block data endpoints."""

from fastapi import APIRouter, HTTPException
from ..models.blocks import BlockListResponse, BlockCodeResponse, BlockInfo

router = APIRouter()

_data_service = None


def set_data_service(ds):
    global _data_service
    _data_service = ds


@router.get("/blocks", response_model=BlockListResponse)
async def get_blocks():
    if _data_service is None or not _data_service.is_ready():
        raise HTTPException(status_code=503, detail="Service not ready")

    df = _data_service.get_all_blocks()
    blocks = [
        BlockInfo(**row)
        for row in df.to_dicts()
    ]

    filter_summary = None
    fr = _data_service.filter_result
    if fr is not None:
        filter_summary = {
            "removed_low_variance": fr.removed_low_variance,
            "removed_correlated": [
                {"removed": r, "kept_instead": k}
                for r, k in fr.removed_correlated
            ],
            "original_count": fr.original_count,
            "surviving_count": fr.surviving_count,
        }

    return BlockListResponse(
        blocks=blocks,
        metric_columns=_data_service.metric_columns,
        all_metric_columns=_data_service.all_metric_columns,
        total_blocks=len(blocks),
        filter_summary=filter_summary,
    )


@router.get("/blocks/{block_id}/code", response_model=BlockCodeResponse)
async def get_block_code(block_id: int):
    if _data_service is None or not _data_service.is_ready():
        raise HTTPException(status_code=503, detail="Service not ready")

    code = _data_service.get_block_code(block_id)
    if code is None:
        raise HTTPException(status_code=404, detail="Block not found")

    lang = _data_service.get_block_language(block_id)
    return BlockCodeResponse(block_id=block_id, code=code, language=lang)
