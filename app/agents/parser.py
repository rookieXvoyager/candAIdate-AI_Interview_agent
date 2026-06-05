# Gemini Resume/JD parser
import os
import yaml
from io import BytesIO
from pypdf import PdfReader
from pydantic import BaseModel, Field
from typing import List
from google import genai
from google.genai import types # <-- Added this import
from app.core.config import settings

# 1. Define the Strict Output Schema
class ParsedProfile(BaseModel):
    candidate_name: str = Field(description="The full name of the candidate found on the resume.")
    core_skills: List[str] = Field(description="List of core technical skills, languages, and frameworks found in the resume.")
    experience_level: str = Field(description="Must be strictly one of: 'Entry', 'Mid', or 'Senior'.")
    primary_domain: str = Field(description="Primary focus area, e.g., 'Backend', 'Frontend', 'Fullstack', 'Data Science'.")
    matched_competencies: List[str] = Field(description="Skills that the candidate possesses which perfectly match the JD requirements.")
    missing_gap_skills: List[str] = Field(description="Key technical skills or requirements requested in the JD that are missing from the resume.")

# 2. Asynchronous Agent Function
async def parse_resume_and_jd(resume_bytes: bytes, jd_text: str) -> ParsedProfile:
    """
    Extracts text from a resume PDF, loads the versioned system instructions,
    and prompts Gemini 2.5 Flash to return a validated, structured user profile.
    """
    # Initialize the new Client architecture
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    # Extract text from PDF bytes safely
    resume_text = ""
    try:
        pdf_stream = BytesIO(resume_bytes)
        reader = PdfReader(pdf_stream)
        for page in reader.pages:
            text = page.extract_text()
            if text:
                resume_text += text + "\n"
    except Exception as e:
        raise ValueError(f"Failed to read and extract text from the PDF file: {str(e)}")

    # Load prompt from our YAML prompt registry
    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "parser_v1.yaml")
    with open(prompt_path, "r") as file:
        prompt_data = yaml.safe_load(file)
    system_instruction = prompt_data.get("system_instruction", "")

    # Execute the request
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
    
    # Generate content using the new SDK syntax
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=user_prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ParsedProfile,
            system_instruction=system_instruction
        )
    )
    
    # Return the validated Pydantic object parsed directly from Gemini's JSON output (Fixed missing parenthesis)
    return ParsedProfile.model_validate_json(response.text)