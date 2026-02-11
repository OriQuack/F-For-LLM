"""API router aggregation."""

from fastapi import APIRouter
from . import blocks, classification, cold_start

router = APIRouter()
router.include_router(blocks.router)
router.include_router(classification.router)
router.include_router(cold_start.router)
