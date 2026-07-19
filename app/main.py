from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.database.session import check_db_connection
from app.api.endpoints import router as api_router

app = FastAPI(
    title="CAT SafeSight API",
    description="AI-powered construction site near-miss detection backend",
    version="1.0.0"
)

# Configure CORS to allow frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the endpoints router
app.include_router(api_router, prefix="/api")

@app.get("/")
async def read_root():
    return {
        "message": "CAT SafeSight API is running",
        "status": "online"
    }

@app.get("/api/health")
async def health_check():
    db_ok = await check_db_connection()
    if not db_ok:
        raise HTTPException(status_code=503, detail="Database connection failed")
    return {
        "status": "healthy",
        "database": "connected"
    }