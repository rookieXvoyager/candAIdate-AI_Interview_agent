import os
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from app.agents.parser import parse_resume_and_jd, ParsedProfile
from app.agents.assessor import generate_assessment, Assessment
from app.agents.generator import generate_sample_jd 
from app.core.security import get_current_user_uid
from app.core.db import save_candidate_profile, save_mcq_assessment
from app.core.config import settings

router = APIRouter()

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain"
}
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


class MCQSubmission(BaseModel):
    answers: List[Optional[str]] = Field(default_factory=list)


class MCQSubmissionResult(BaseModel):
    correct: int
    total: int
    unanswered: int
    percentage: float
    breakdown: list
    session_id: Optional[str] = None

@router.post("/parse", response_model=dict)
async def parse_candidate_context(
    resume: UploadFile = File(..., description="The candidate's resume file(PDF, DOCX or TXT)"),
    jd_text: str = Form(..., description="The text of the target job description"),
    uid: str = Depends(get_current_user_uid)
):
    """
    Secure endpoint that accepts a resume and a text Job Description,
    processes them via the Gemini Parser Agent, and commits the result to Firestore.
    """
    jd_clean = jd_text.strip()
    
    # 1. Strict backend validation for empty JDs
    if not jd_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The job description cannot be empty or contain only spaces."
        )
        
    # 2. Strict validation for gibberish / too short JDs
    # A real job description will be well over 50 characters.
    if len(jd_clean) < 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The job description is too short to be valid. Please paste a complete job description or use the Auto-Generate tool."
        )

    file_ext = os.path.splitext(resume.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{file_ext}'. Only PDF, DOCX and TXT files are supported"
        )
    
    if resume.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid content type detected. File maybe corrupted or disguised."
        )
        
    try:
        resume_bytes = await resume.read()
        
        # 3. Check for completely empty files
        if len(resume_bytes) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="The uploaded resume file is completely empty."
            )
            
        # 4. Check for suspiciously small files (corrupted/fake PDFs)
        # 500 bytes is incredibly small for a PDF/Word doc. If it's this small, it's not a real resume.
        if len(resume_bytes) < 500:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="The uploaded file is invalid or corrupted (file size is suspiciously small)."
            )
            
        MAX_FILE_SIZE_MB = 5
        if len(resume_bytes) > (MAX_FILE_SIZE_MB * 1024 * 1024):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"File is too large. Maximum allowed size is {MAX_FILE_SIZE_MB}MB."
            )
            
        profile_data = await parse_resume_and_jd(resume_bytes, file_ext, jd_clean)
        await save_candidate_profile(uid=uid, profile_data=profile_data.model_dump())
        
        return {
            "uid": uid, 
            "profile": profile_data
        }   
        
    except ValueError as val_err:
        raise HTTPException(status_code=422, detail=str(val_err))
    except Exception as e:
        print(f"🚨 ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An error occurred during parsing: {str(e)}")
    

@router.post("/generate-mcq", response_model=dict)
async def create_prescreen_quiz(
    profile: ParsedProfile,
    uid: str = Depends(get_current_user_uid) 
):
    """
    Accepts a structured candidate profile, generates a tailored 5-question 
    multiple-choice assessment, and creates a pending state session inside Firestore.
    """
    try:
        assessment_data = await generate_assessment(profile)
        session_id = f"sess_{uuid.uuid4().hex[:8]}"
        
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


@router.post("/submit-mcq/{session_id}", response_model=MCQSubmissionResult)
async def submit_prescreen_quiz(
    session_id: str,
    submission: Optional[MCQSubmission] = None,
    uid: str = Depends(get_current_user_uid),
):
    """
    Grade a submitted MCQ assessment. Missing, null, or extra answers are
    treated safely; unanswered questions receive zero points.
    """
    from app.core.db import db, save_mcq_submission

    session_ref = db.collection("sessions").document(session_id)
    session = session_ref.get()

    if not session.exists:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    session_data = session.to_dict() or {}
    if session_data.get("uid") != uid:
        raise HTTPException(status_code=403, detail="You do not own this interview session.")

    mcq_quiz = session_data.get("mcq_quiz") or {}
    questions = mcq_quiz.get("questions") or []
    if not isinstance(questions, list) or not questions:
        raise HTTPException(status_code=409, detail="The assessment has no questions.")

    submitted_answers = submission.answers if submission is not None else []
    normalized_answers = [
        submitted_answers[index] if index < len(submitted_answers) else None
        for index in range(len(questions))
    ]

    breakdown = []
    correct = 0
    unanswered = 0

    for index, question in enumerate(questions):
        user_answer = normalized_answers[index]
        correct_answer = question.get("correct_answer")

        if user_answer is None or str(user_answer).strip() == "":
            status_label = "unanswered"
            unanswered += 1
            is_correct = False
        elif str(user_answer).strip().upper() == str(correct_answer).strip().upper():
            status_label = "correct"
            correct += 1
            is_correct = True
        else:
            status_label = "incorrect"
            is_correct = False

        breakdown.append(
            {
                "index": index,
                "question": question.get("question"),
                "user_answer": user_answer,
                "correct_answer": correct_answer,
                "status": status_label,
                "is_correct": is_correct,
            }
        )

    total = len(questions)
    mcq_result = {
        "correct": correct,
        "total": total,
        "unanswered": unanswered,
        "percentage": round((correct / total) * 100, 2) if total else 0.0,
        "breakdown": breakdown,
        "session_id": session_id,
    }

    await save_mcq_submission(
        session_id=session_id,
        uid=uid,
        mcq_answers=normalized_answers,
        mcq_result=mcq_result,
    )

    return MCQSubmissionResult(**mcq_result)

# --- NEW ENDPOINT FOR JD GENERATION ---
@router.get("/sample-jd")
async def get_sample_jd(
    role: str = Query(..., description="Target job title"),
    experience: str = Query("Mid-Level", description="Experience level (Entry, Mid, Senior, etc)"),
    uid: str = Depends(get_current_user_uid) 
):
    """
    Generates a realistic mock job description based on a role title and experience level.
    """
    try:
        jd_text = await generate_sample_jd(role, experience)
        return {"jd_text": jd_text}
    except Exception as e:
        print(f"🚨 JD Generation Error: {str(e)}")
        raise HTTPException(
            status_code=502,
            detail="The AI provider could not generate a sample job description.",
        ) from e