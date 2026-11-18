import os
import docx
import yaml
from io import BytesIO
from pypdf import PdfReader
from pydantic import BaseModel, Field
from typing import List
from google import genai
from google.genai import types 
from app.core.config import settings
from app.agents._gemini import generate_with_fallback

class ParsedProfile(BaseModel):
    # --- NEW: Give Gemini an escape hatch ---
    is_valid_resume: bool = Field(description="Set to true ONLY if the document text appears to be a genuine resume, CV, or professional profile. Set to false if it is gibberish or unrelated.")
    
    candidate_name: str = Field(description="The full name of the candidate found on the resume.")
    core_skills: List[str] = Field(description="List of core technical skills, languages, and frameworks found in the resume.")
    experience_level: str = Field(description="Must be strictly one of: 'Entry', 'Mid', or 'Senior'.")
    primary_domain: str = Field(description="Primary focus area, e.g., 'Backend', 'Frontend', 'Fullstack', 'Data Science'.")
    matched_competencies: List[str] = Field(description="Skills that the candidate possesses which perfectly match the JD requirements.")
    missing_gap_skills: List[str] = Field(description="Key technical skills or requirements requested in the JD that are missing from the resume.")

async def parse_resume_and_jd(resume_bytes: bytes, file_ext: str, jd_text: str) -> ParsedProfile:
    """
    Extracts text from a resume (PDF, DOCX or TXT), loads the versioned system instructions,
    and prompts Gemini to return a validated, structured user profile.
    """
    
    # 🔒 SECURE: Restored environment variable usage to prevent key leaks
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is missing from configuration.")
        
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    resume_text = ""
    try:
        if file_ext == ".pdf":
            pdf_stream = BytesIO(resume_bytes)
            reader = PdfReader(pdf_stream)
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    resume_text += text + "\n"
        elif file_ext == ".docx":
            docx_stream = BytesIO(resume_bytes)
            doc = docx.Document(docx_stream)
            for para in doc.paragraphs:
                resume_text += para.text + "\n"
        elif file_ext == ".txt":
            resume_text = resume_bytes.decode('utf-8')
        else:
            raise ValueError(f"unsupported file format: {file_ext}")
            
    except Exception as e:
        raise ValueError(f"Failed to read and extract text from the {file_ext.upper()} file: {str(e)}")

    # --- NEW: Stop the process if extraction yielded nothing (e.g., Scanned PDF) ---
    if not resume_text.strip():
        raise ValueError("Could not extract any readable text from the document. If this is a PDF, ensure it is text-based and not a scanned image.")

    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "parser_v1.yaml")
    try:
        with open(prompt_path, "r") as file:
            prompt_data = yaml.safe_load(file)
        system_instruction = prompt_data.get("system_instruction", "")
    except FileNotFoundError:
        system_instruction = "You are an expert technical recruiter."

    user_prompt = f"""
    RESUME TEXT:
    \"\"\"
    {resume_text}
    \"\"\"

    TARGET JOB DESCRIPTION:
    \"\"\"
    {jd_text}
    \"\"\"
    """
    
    # Generate content, falling back across models if rate-limited
    response = generate_with_fallback(
        client,
        models=settings.resolved_models,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ParsedProfile,
            system_instruction=system_instruction
        )
    )
    
    # Return the validated Pydantic object parsed directly from Gemini's JSON output
    profile = ParsedProfile.model_validate_json(response.text)
    
    # --- NEW: Reject if Gemini flagged it as a fake resume ---
    if not profile.is_valid_resume:
         raise ValueError("The uploaded document does not appear to be a valid professional resume.")
         
    return profile