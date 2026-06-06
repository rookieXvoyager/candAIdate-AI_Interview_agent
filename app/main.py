from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
# ... the rest of your imports
from app.api.v1.setup import router as setup_router
from app.api.v1 import setup, interview
from app.api.v1.evaluate import router as evaluate_router
app = FastAPI(
    title="AI Interview Partner Backend",
    description="High-performance, low-latency AI agent backend for mock technical interviews.",
    version="1.0.0"
)

# Configure CORS so your frontend development server can access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount our v1 setup router
app.include_router(setup_router, prefix="/api/v1/setup", tags=["Setup & Pre-screening"])
# live interview websocket router
app.include_router(interview.router, prefix="/api/v1/interview", tags=["Live Interview"])
app.include_router(evaluate_router, prefix='/api/v1/evaluate', tags=["Evaluation & Coaching"])

@app.exception_handler(Exception)
async def global_exception_handler(request:Request, exc:Exception):
    """
    Catches ALL unhandled exceptions across the entire FastAPI app.
    Prevents the server from crashing and returns a clean JSON response.
    """
    # 1. Log the actual error to your server console for debugging
    print(f"🚨 CRITICAL ERROR on {request.method} {request.url.path}: {repr(exc)}")
    
    # 2. Return a safe, structured JSON response to the frontend
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "status": "error",
            "message": "An unexpected server error occurred. Please try again later.",
            "path": request.url.path
            # Note: We intentionally do NOT send `str(exc)` to the frontend for security reasons!
        }
    )
@app.get("/health", tags=["System"])
async def health_check():
    """Simple health check verification endpoint."""
    return {"status": "healthy", "engine": "FastAPI"}

