"""Cold start endpoint."""

from fastapi import APIRouter, HTTPException
from ..models.cold_start import ColdStartRequest, ColdStartResponse

router = APIRouter()

_cold_start_service = None


def set_cold_start_service(svc):
    global _cold_start_service
    _cold_start_service = svc


@router.post("/cold-start/representative", response_model=ColdStartResponse)
async def cold_start_representative(request: ColdStartRequest):
    if _cold_start_service is None:
        raise HTTPException(status_code=503, detail="Service not ready")

    ids = await _cold_start_service.get_suggestions(
        request.block_ids, request.num_suggestions
    )
    return ColdStartResponse(suggestion_ids=ids)
