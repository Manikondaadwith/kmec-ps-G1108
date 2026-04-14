from __future__ import annotations

import gc
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
import os
import tempfile
from typing import Any

import torch
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.schemas import AnalyzeUrlRequest, ScoutChatRequest
from app.config import Settings, get_settings
from app.pipeline.config import PRODUCTION_METRICS
from app.pipeline.model import build_model, download_model_if_needed, parameter_count
from app.services.analysis_service import AnalysisService
from app.services.scout.service import ScoutContext, ScoutService
from app.services.supabase import AuthenticatedUser, SupabaseService

logger = logging.getLogger(__name__)


@dataclass
class BackendState:
    settings: Settings
    supabase_service: SupabaseService
    analysis_service: AnalysisService
    scout_service: ScoutService
    model: torch.nn.Module | None = None
    device: torch.device = torch.device("cpu")
    model_error: str | None = None
    model_parameter_count: int = 0


def _load_model(state: BackendState) -> None:
    """Load the model weights. Designed to be called lazily on first request."""
    model = build_model()
    # Download from Supabase if no local path, or local path doesn't exist
    if state.settings.model_path and state.settings.model_path.exists():
        model_path = str(state.settings.model_path)
    else:
        model_path = download_model_if_needed()
    # Force CPU to minimize memory overhead on free-tier hosting
    weights = torch.load(model_path, map_location="cpu", weights_only=True)
    model.load_state_dict(weights)
    # Free the weights dict immediately — model already has the parameters
    del weights
    gc.collect()
    model.to(state.device)
    model.eval()
    state.model = model
    state.model_parameter_count = parameter_count(model)
    state.model_error = None
    logger.info("Model loaded successfully (%d parameters)", state.model_parameter_count)


def _ensure_model(state: BackendState) -> None:
    """Lazy-load model on first request. Avoids startup memory spike."""
    if state.model is not None:
        return
    if state.model_error:
        raise RuntimeError(f"Model previously failed to load: {state.model_error}")
    try:
        _load_model(state)
    except Exception as exc:
        state.model_error = str(exc)
        logger.exception("Lazy model load failed")
        raise


def create_app(settings: Settings | None = None, load_model_on_startup: bool = False) -> FastAPI:
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        supabase_service = SupabaseService(resolved_settings)
        app_state = BackendState(
            settings=resolved_settings,
            supabase_service=supabase_service,
            analysis_service=AnalysisService(supabase_service, settings=resolved_settings),
            scout_service=ScoutService(resolved_settings, supabase_service),
        )
        app.state.backend = app_state
        # Model is lazy-loaded on first inference request to avoid startup memory spike
        if load_model_on_startup:
            try:
                _load_model(app_state)
            except Exception as exc:  # pragma: no cover - depends on external model file
                app_state.model_error = str(exc)
        logger.info("NeuroSentinel backend started (model will load on first request)")
        yield

    app = FastAPI(title="NeuroSentinel Backend", lifespan=lifespan)
    security = HTTPBearer(auto_error=False)

    def get_backend_state(request: Request) -> BackendState:
        return request.app.state.backend

    def get_authenticated_user(
        credentials: HTTPAuthorizationCredentials | None = Depends(security),
        state: BackendState = Depends(get_backend_state),
    ) -> AuthenticatedUser:
        if credentials is None or not credentials.credentials:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")
        try:
            return state.supabase_service.verify_access_token(credentials.credentials)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid session: {exc}") from exc

    @app.get("/health")
    async def health(state: BackendState = Depends(get_backend_state)) -> dict[str, Any]:
        return {
            "service": "ok",
            "model_ready": state.model is not None,
            "model_error": state.model_error,
            "model_path": str(state.settings.model_path),
        }

    @app.get("/api/v1/model/info")
    async def model_info(state: BackendState = Depends(get_backend_state)) -> dict[str, Any]:
        return {
            "version": PRODUCTION_METRICS["version"],
            "ready": state.model is not None,
            "parameter_count": state.model_parameter_count,
            "declared_metrics": PRODUCTION_METRICS,
            "error": state.model_error,
        }

    @app.post("/api/v1/analyze")
    async def analyze(
        file: UploadFile = File(...),
        user: AuthenticatedUser = Depends(get_authenticated_user),
        state: BackendState = Depends(get_backend_state),
    ) -> dict[str, Any]:
        # Lazy-load model on first request
        try:
            _ensure_model(state)
        except Exception:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Model is not ready: {state.model_error or 'unknown error'}")
        if not file.filename or not file.filename.lower().endswith(".edf"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .edf files are supported.")

        file_name = file.filename

        # Stream upload directly to disk — never buffer entire file in RAM
        suffix = ".edf"
        temp_path: str | None = None
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
            temp_path = handle.name
            while True:
                chunk = await file.read(8192)
                if not chunk:
                    break
                handle.write(chunk)
        await file.close()

        # Create the report record immediately so the frontend can track it
        from uuid import uuid4
        report_id = str(uuid4())
        state.analysis_service.supabase_service.insert_report(
            {
                "id": report_id,
                "user_id": user.id,
                "filename": file_name,
                "storage_path": None,
                "status": "processing",
                "error_message": None,
                "summary": "Your EEG file has been received. Analysis is running in the background — you can safely close this page.",
                "report_json": None,
            }
        )

        # Run the heavy analysis in a background thread
        import asyncio

        async def _run_analysis_background():
            try:
                await asyncio.to_thread(
                    state.analysis_service.run_analysis_upload_for_report,
                    model=state.model,
                    device=state.device,
                    user_id=user.id,
                    file_name=file_name,
                    edf_path=temp_path,
                    report_id=report_id,
                    batch_size=state.settings.analysis_batch_size,
                )
            except Exception as exc:
                logger.exception("Background analysis failed for report %s", report_id)
            finally:
                if temp_path and os.path.exists(temp_path):
                    os.remove(temp_path)
                gc.collect()

        asyncio.create_task(_run_analysis_background())

        return {
            "report_id": report_id,
            "status": "processing",
            "summary": "Your EEG file has been received. Analysis is running in the background — you can safely close this page.",
        }

    @app.post("/api/v1/analyze-url")
    async def analyze_url(
        payload: AnalyzeUrlRequest,
        user: AuthenticatedUser = Depends(get_authenticated_user),
        state: BackendState = Depends(get_backend_state),
    ) -> dict[str, Any]:
        """Accept a Supabase Storage URL (file already uploaded by the frontend)
        and run the EEG analysis pipeline. This avoids Vercel's body-size limit."""
        # Lazy-load model on first request
        try:
            _ensure_model(state)
        except Exception:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Model is not ready: {state.model_error or 'unknown error'}")

        file_url = payload.file_url
        file_name = payload.filename

        if not file_name.lower().endswith(".edf"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .edf files are supported.")

        # Stream download directly to disk — never buffer entire file in RAM
        import httpx as _httpx

        suffix = ".edf"
        temp_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
                temp_path = handle.name
                async with _httpx.AsyncClient(timeout=300) as client:
                    async with client.stream("GET", file_url) as dl_response:
                        dl_response.raise_for_status()
                        async for chunk in dl_response.aiter_bytes(chunk_size=8192):
                            handle.write(chunk)
        except Exception as dl_exc:
            # Clean up partial download
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to download file from storage: {dl_exc}",
            )

        # Create the report record immediately so the frontend can track it
        from uuid import uuid4 as _uuid4
        report_id = str(_uuid4())
        state.analysis_service.supabase_service.insert_report(
            {
                "id": report_id,
                "user_id": user.id,
                "filename": file_name,
                "storage_path": file_url,
                "status": "processing",
                "error_message": None,
                "summary": "Your EEG file has been received. Analysis is running in the background — you can safely close this page.",
                "report_json": None,
            }
        )

        # Run the heavy analysis in a background thread
        import asyncio as _asyncio

        async def _run_url_analysis_background():
            try:
                await _asyncio.to_thread(
                    state.analysis_service.run_analysis_upload_for_report,
                    model=state.model,
                    device=state.device,
                    user_id=user.id,
                    file_name=file_name,
                    edf_path=temp_path,
                    report_id=report_id,
                    batch_size=state.settings.analysis_batch_size,
                )
            except Exception as exc:
                logger.exception("Background analysis failed for report %s", report_id)
            finally:
                if temp_path and os.path.exists(temp_path):
                    os.remove(temp_path)
                gc.collect()

        _asyncio.create_task(_run_url_analysis_background())

        return {
            "report_id": report_id,
            "status": "processing",
            "summary": "Your EEG file has been received. Analysis is running in the background — you can safely close this page.",
        }

    @app.post("/api/v1/scout/chat")
    async def scout_chat(
        payload: ScoutChatRequest,
        user: AuthenticatedUser = Depends(get_authenticated_user),
        state: BackendState = Depends(get_backend_state),
    ) -> dict[str, Any]:
        response = await state.scout_service.chat(
            ScoutContext(
                user_id=user.id,
                message=payload.message,
                page=payload.context.page,
                role=payload.context.role,
                report_id=payload.context.report_id,
                current_report=payload.context.current_report,
                session_history=[{"role": h.role, "content": h.content} for h in payload.history],
            )
        )
        return response

    return app


app = create_app()
