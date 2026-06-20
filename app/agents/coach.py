# Gemini Plan-and-Execute logic
import os
import json
import yaml
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from typing import List
from app.core.config import settings
from app.agents._gemini import generate_with_fallback

class EvaluationResult(BaseModel):
    score: int= Field(..., description="Overall score out of 100 based on technical accuracy and communication.")
    strengths: List[str] = Field(..., description="Top 2 to 3 strengths demonstrated by the candidate.")
    weaknesses: List[str]=Field(..., description="Top 2 to 3 areas where the candidate needs improvement.")
    detailed_feedback: str= Field(..., description="A comprehensive, objective paragraph of feedback.")

class CoachingAgent:
    def __init__(self):
        self.client=genai.Client(api_key=settings.GEMINI_API_KEY)
        self.system_prompt=self._load_system_prompt()

    def _load_system_prompt(self)->str:
        prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "coach_v1.yaml")
        try:
            with open(prompt_path, "r") as file:
                prompt_data = yaml.safe_load(file)
            return prompt_data.get("system_instruction", "You are expert technical interview coach.")
        except FileNotFoundError:
            return "You are an expert technical interview coach."
        
    def evaluate_interview(self, target_role:str, transcript:str)-> EvaluationResult:
        prompt=f"""
    TARGET ROLE: {target_role}

    INTERVIEW TRANSCRIPT:
    {transcript}
"""
        response = generate_with_fallback(
            self.client,
            models=settings.resolved_models,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=self.system_prompt,
                response_mime_type="application/json",
                response_schema=EvaluationResult,
                temperature=0.2,
            )
        )
        result_dict =json.loads(response.text)
        return EvaluationResult(**result_dict)
    