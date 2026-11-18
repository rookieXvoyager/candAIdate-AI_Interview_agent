import os
import sys
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Import routers from the correct, direct paths
from app.api.v1.setup import router as setup_router
from app.api.v1.stream import router as stream_router
from app.api.v1.evaluate import router as evaluate_router
from app.api.v1.coding import router as coding_router

print(f"[BOOT] main imported from={__file__} cwd={os.getcwd()} py={sys.executable}")

app = FastAPI(
    title="AI Interview Partner Backend",
    description="High-performance, low-latency AI agent backend for mock technical interviews.",
    version="1.0.0"
)

# 🔒 Configure CORS for Production & Local Development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",            
        "http://localhost:5173",       # Local React development (Vite)
        "http://127.0.0.1:5173",       # Local React development
        "http://localhost:3000",       # Local Next.js/React development
        "http://140.245.220.218",      # Server Public IP (Direct HTTP testing)
        "https://candaidate.app",      # Production Domain
        "https://www.candaidate.app"   # Production Domain (www)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(setup_router, prefix="/api/v1/setup", tags=["Setup & Pre-screening"])
app.include_router(stream_router, prefix="/api/v1/interview", tags=["Live Interview"])
app.include_router(evaluate_router, prefix="/api/v1/evaluate", tags=["Evaluation & Coaching"])
app.include_router(coding_router, prefix="/api/v1/coding", tags=["Coding Assessment"])

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Safely handles exceptions, explicitly avoiding use of 'request.method' 
    which causes crashes on WebSocket disconnects.
    """
    method = getattr(request, 'method', 'WS')
    print(f"🚨 CRITICAL ERROR on {method} {request.url.path}: {repr(exc)}")
    
    if request.scope.get("type") == "websocket":
        return 
        
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"status": "error", "message": "Server error occurred."}
    )

@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "healthy", "engine": "FastAPI"}