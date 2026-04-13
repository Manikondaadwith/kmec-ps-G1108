from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
import os
import tempfile
from typing import Any

import torch
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.schemas import ScoutChatRequest
from app.config import Settings, get_settings
from app.pipeline.config import PRODUCTION_METRICS
from app.pipeline.model import build_model, parameter_count
from app.services.analysis_service import AnalysisService
from app.services.scout.service import ScoutContext, ScoutService
from app.services.supabase import AuthenticatedUser, SupabaseService


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
    model = build_model()
    weights = torch.load(state.settings.model_path, map_location=state.device, weights_only=True)
    model.load_state_dict(weights)
    model.to(state.device)
    model.eval()
    state.model = model
    state.model_parameter_count = parameter_count(model)
    state.model_error = None


def create_app(settings: Settings | None = None, load_model_on_startup: bool = True) -> FastAPI:
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
        if load_model_on_startup:
            try:
                _load_model(app_state)
            except Exception as exc:  # pragma: no cover - depends on external model file
                app_state.model_error = str(exc)
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
        if state.model is None:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Model is not ready: {state.model_error or 'unknown error'}")
        if not file.filename or not file.filename.lower().endswith(".edf"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .edf files are supported.")

        # Read the file into memory first so we can return immediately
        file_bytes = await file.read()
        await file.close()
        file_name = file.filename

        # Write to temp file for the analysis pipeline
        suffix = ".edf"
        temp_path: str | None = None
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
            temp_path = handle.name
            handle.write(file_bytes)

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
                import logging
                logging.getLogger(__name__).exception("Background analysis failed for report %s", report_id)
            finally:
                if temp_path and os.path.exists(temp_path):
                    os.remove(temp_path)

        asyncio.create_task(_run_analysis_background())

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
