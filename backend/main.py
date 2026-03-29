from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routes.chat import router as chat_router
from routes.export import router as export_router
from routes.generate import router as generate_router
from routes.health import router as health_router
from routes.optimize import router as optimize_router
from routes.profile import router as profile_router
from routes.score import router as score_router
from routes.update import router as update_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="Mantis API",
        description="Backend foundation for the Mantis resume workspace.",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    register_exception_handlers(app)

    app.include_router(health_router, prefix="/api")
    app.include_router(profile_router, prefix="/api")
    app.include_router(generate_router, prefix="/api")
    app.include_router(update_router, prefix="/api")
    app.include_router(chat_router, prefix="/api")
    app.include_router(score_router, prefix="/api")
    app.include_router(export_router, prefix="/api")
    app.include_router(optimize_router, prefix="/api")
    return app


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "error": str(exc.detail)},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        first_error = exc.errors()[0] if exc.errors() else {"msg": "Invalid request."}
        return JSONResponse(
            status_code=422,
            content={"success": False, "error": str(first_error.get("msg", "Invalid request."))},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "Internal server error."},
        )


app = create_app()
