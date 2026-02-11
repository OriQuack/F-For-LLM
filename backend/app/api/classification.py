"""SVM classification endpoint."""

from fastapi import APIRouter, HTTPException
from ..models.classification import SimilarityHistogramRequest, SimilarityHistogramResponse

router = APIRouter()

_classification_service = None


def set_classification_service(svc):
    global _classification_service
    _classification_service = svc


@router.post("/similarity-score-histogram", response_model=SimilarityHistogramResponse)
async def similarity_score_histogram(request: SimilarityHistogramRequest):
    if _classification_service is None:
        raise HTTPException(status_code=503, detail="Service not ready")
    return await _classification_service.get_similarity_score_histogram(request)
