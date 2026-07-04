import os
import json
import yaml
from pydantic import BaseModel, Field
from typing import List
from google import genai
from google.genai import types 
from app.core.config import settings
from app.agents.parser import ParsedProfile
from app.agents._gemini import generate_with_fallback

# Attempt to import Groq for the fallback mechanism
try:
    from groq import Groq
except ImportError:
    Groq = None

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
    If Gemini fails (e.g. rate limit), falls back to Groq.
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is missing from configuration.")
        
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    groq_client = Groq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY and Groq else None
    
    # Load prompt from our YAML registry
    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "assessor_v1.yaml")
    try:
        with open(prompt_path, "r") as file:
            prompt_data = yaml.safe_load(file)
        system_instruction = prompt_data.get("system_instruction", "You are an expert technical assessor.")
    except FileNotFoundError:
        system_instruction = "You are an expert technical assessor."

    # Feed the previously generated JSON profile straight into the prompt
    user_prompt = f"""
    Generate the assessment based on this candidate profile:
    {profile.model_dump_json(indent=2)}
    """
    
    # 3. Try Primary Agent (Gemini)
    try:
        print("🧠 [Assessor] Requesting MCQ generation from Gemini...")
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
        print("✅ [Assessor] Successfully generated MCQ via Gemini.")
        return Assessment.model_validate_json(response.text)
        
    # 4. Fallback to Groq (Llama-3) on Failure
    except Exception as gemini_err:
        print(f"🚨 [Assessor Gemini Failed]: {gemini_err}. Attempting Groq Fallback...")
        
        if not groq_client:
            raise ValueError(f"Gemini failed and Groq API Key is not configured. Original Error: {gemini_err}")
            
        schema_instructions = f"""
        You must respond ONLY with a raw, valid JSON object that exactly matches this schema:
        {Assessment.model_json_schema()}
        Do not include markdown blocks, backticks, or extra text. Just the JSON string.
        """
        
        print("🚀 [Assessor] Sending request to Groq Llama-3-70B...")
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_instruction + "\n" + schema_instructions},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        
        result_dict = json.loads(completion.choices[0].message.content)
        print("✅ [Assessor] Successfully generated MCQ via Groq Fallback.")
        return Assessment(**result_dict)