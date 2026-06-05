from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
@app.get("/health", tags=["System"])
async def health_check():
    """Simple health check verification endpoint."""
    return {"status": "healthy", "engine": "FastAPI"}

