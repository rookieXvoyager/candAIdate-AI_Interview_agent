import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from app.agents.parser import parse_resume_and_jd, ParsedProfile
from app.agents.assessor import generate_assessment, Assessment
from app.core.security import verify_firebase_token
from app.core.db import save_candidate_profile, save_mcq_assessment  # <-- Import database triggers

router = APIRouter()

@router.post("/parse", response_model=dict)
async def parse_candidate_context(
    resume: UploadFile = File(..., description="The candidate's resume PDF file"),
    jd_text: str = Form(..., description="The text of the target job description")
):
    """
    Secure endpoint that accepts a PDF resume and a text Job Description,
    processes them via the Gemini Parser Agent, and commits the result to Firestore.
    """
    # Validating the file extension
    if not resume.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted for resume uploads.")
    
    try:
        # Reading raw file bytes
        resume_bytes = await resume.read()
        
        # 1. Handoff execution to the Parser agent 
        profile_data = await parse_resume_and_jd(resume_bytes, jd_text)
        
        # 2. Mint a mock User ID (Temporary replacement until frontend Auth injection is ready)
        mock_uid = f"user_{uuid.uuid4().hex[:8]}"
        
        # 3. Commit the raw dictionary to the /users Firestore collection
        await save_candidate_profile(uid=mock_uid, profile_data=profile_data.model_dump())
        
        # Return both the identifier and data payload back to the client
        return {
            "uid": mock_uid,
            "profile": profile_data
        }
    
    except ValueError as val_err:
        raise HTTPException(status_code=422, detail=str(val_err))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred during parsing: {str(e)}")
    

@router.post("/generate-mcq", response_model=dict)
async def create_prescreen_quiz(
    uid: str,  # <-- Require the explicit user mapping ID 
    profile: ParsedProfile
):
    """
    Accepts a structured candidate profile, generates a tailored 5-question 
    multiple-choice assessment, and creates a pending state session inside Firestore.
    """
    try:
        # 1. Hand off execution to the Assessor agent
        assessment_data = await generate_assessment(profile)
        
        # 2. Mint a unique session token for tracking this individual technical evaluation
        session_id = f"sess_{uuid.uuid4().hex[:8]}"
        
        # 3. Commit the full schema payload to the /sessions Firestore collection
        await save_mcq_assessment(
            session_id=session_id, 
            uid=uid, 
            target_role=profile.primary_domain, 
            assessment_data=assessment_data.model_dump()
        )
        
        return {
            "session_id": session_id,
            "assessment": assessment_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred while generating the assessment: {str(e)}")