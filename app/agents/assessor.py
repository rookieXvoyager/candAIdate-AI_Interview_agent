import os
import yaml
from pydantic import BaseModel, Field
from typing import List
from google import genai
from google.genai import types # <-- Required for the new configuration syntax
from app.core.config import settings
from app.agents.parser import ParsedProfile
from app.agents._gemini import generate_with_fallback

# 1. Define the Strict Output Schemas
class MCQOption(BaseModel):
    key: str = Field(description="Must be strictly 'A', 'B', 'C', or 'D'.")
    text: str = Field(description="The text for this multiple-choice option.")

class MCQ(BaseModel):
    question: str = Field(description="The technical question text.")
    options: List[MCQOption] = Field(description="Exactly 4 options for the candidate to choose from.")
    correct_answer: str = Field(description="The key of the correct option (A, B, C, or D).")
    explanation: str = Field(description="A brief, 1-2 sentence explanation of why the correct answer is right.")

class Assessment(BaseModel):
    questions: List[MCQ] = Field(description="A list containing exactly 5 multiple-choice questions.")

# 2. Asynchronous Agent Function
async def generate_assessment(profile: ParsedProfile) -> Assessment:
    """
    Takes a structured candidate profile, loads the assessor prompt, 
    and uses Gemini to generate a tailored 5-question MCQ test.
    """
    # Initialize the new Client architecture
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    # Load prompt from our YAML registry
    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "assessor_v1.yaml")
    with open(prompt_path, "r") as file:
        prompt_data = yaml.safe_load(file)
    system_instruction = prompt_data.get("system_instruction", "")

    # Feed the previously generated JSON profile straight into the prompt
    user_prompt = f"""
    Generate the assessment based on this candidate profile:
    {profile.model_dump_json(indent=2)}
    """
    
    # Generate content, falling back across models if rate-limited
    response = generate_with_fallback(
        client,
        models=settings.resolved_models,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=Assessment,
            system_instruction=system_instruction
        )
    )
    
    # Validate and return the Pydantic object
    return Assessment.model_validate_json(response.text)