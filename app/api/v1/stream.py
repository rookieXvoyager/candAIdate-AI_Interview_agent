# WS ws://api/v1/interview/stream (Live Sandbox)
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from app.agents.parser import parse_resume_and_jd, ParsedProfile
from app.agents.assessor import generate_assessment, Assessment
from app.core.security import verify_firebase_token
from app.core.db import save_candidate_profile, save_mcq_assessment

router =APIRouter()

@router.post("/parse", response_model=dict)
async def parse_candidate_context(
    resume: UploadFile=File(..., description="The candidate's resume PDF file"),
    jd_text: str=Form(..., description="The text of the target jon desctiptiion")

)