from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import sys
import os
from contextlib import asynccontextmanager

from .api import router as api_router
from .services.data_service import DataService
from .services.classification_service import ClassificationService
from .services.cold_start_service import ColdStartService
from .api import blocks, classification, cold_start

log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True,
)
logger = logging.getLogger(__name__)

data_service = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global data_service
    try:
        data_service = DataService()
        await data_service.initialize()
        logger.info("DataService initialized")

        cls_service = ClassificationService(data_service)
        classification.set_classification_service(cls_service)
        logger.info("ClassificationService initialized")

        cs_service = ColdStartService(data_service)
        cold_start.set_cold_start_service(cs_service)
        logger.info("ColdStartService initialized")

        blocks.set_data_service(data_service)

        yield
    except Exception as e:
        logger.error(f"Failed to initialize: {e}")
        raise


app = FastAPI(
    title="Code Authorship Classifier API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3004",
        "http://localhost:5174",
        "http://127.0.0.1:3004",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"error": str(exc)})


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "data_service": "connected" if data_service and data_service.is_ready() else "disconnected",
    }


app.include_router(api_router, prefix="/api")
