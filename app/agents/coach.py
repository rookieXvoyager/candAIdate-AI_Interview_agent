import os
import json
import yaml
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from typing import List
from app.core.config import settings
from app.agents._gemini import generate_with_fallback

try:
    from groq import Groq
except ImportError:
    Groq = None

class SectionFeedback(BaseModel):
    score: int = Field(..., description="Section score from 0 to 100.")
    summary: str = Field(..., description="Concise section-specific summary.")
    strengths: List[str] = Field(default_factory=list)
    improvements: List[str] = Field(default_factory=list)


class OverallFeedback(BaseModel):
    verdict: str = Field(..., description="Readiness verdict.")
    executive_summary: str = Field(..., description="Overall executive summary.")
    key_strengths: List[str] = Field(default_factory=list)
    priority_improvements: List[str] = Field(default_factory=list)
    next_steps: List[str] = Field(default_factory=list)


class EvaluationResult(BaseModel):
    score: int = Field(..., description="Legacy overall score.")
    overall_score: int = Field(..., description="Weighted overall score.")
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    detailed_feedback: str = Field(..., description="Legacy detailed feedback.")
    score_breakdown: dict = Field(default_factory=dict)
    section_feedback: dict = Field(default_factory=dict)
    overall_feedback: OverallFeedback = Field(
        default_factory=lambda: OverallFeedback(
            verdict="Needs more practice",
            executive_summary="No detailed overall feedback was generated.",
        )
    )

class CoachingAgent:
    def __init__(self):
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.groq_client = Groq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY and Groq else None
        self.system_prompt = self._load_system_prompt()

    def _load_system_prompt(self)->str:
        prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "coach_v1.yaml")
        try:
            with open(prompt_path, "r") as file:
                prompt_data = yaml.safe_load(file)
            return prompt_data.get("system_instruction", "You are expert technical interview coach.")
        except FileNotFoundError:
            return "You are an expert technical interview coach."
        
    def evaluate_interview(
        self,
        target_role: str,
        transcript: str,
        section_context: dict | None = None,
    ) -> EvaluationResult:
        prompt = f"""
        TARGET ROLE: {target_role}

        INTERVIEW TRANSCRIPT:
        {transcript}

        DETERMINISTIC SECTION CONTEXT:
        {json.dumps(section_context or {}, ensure_ascii=False)}

        Score the candidate holistically. The overall score and score breakdown
        are already deterministic and MUST remain authoritative. Do not change
        overall_score or score_breakdown. Return section_feedback for mcq,
        coding when present, and interview; and overall_feedback with verdict,
        executive_summary, key_strengths, priority_improvements, and next_steps.
        """
        
        # 1. Try Primary (Gemini)
        try:
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
            result_dict = json.loads(response.text)
            return EvaluationResult(**result_dict)
            
        except Exception as gemini_err:
            print(f"🚨 [Coach Gemini Failed]: {gemini_err}. Attempting Groq Fallback...")
            
            # 2. Try Fallback (Groq) in JSON Mode
            if not self.groq_client:
                raise ValueError("Both Gemini failed and Groq API Key is not configured.")
                
            schema_instructions = f"""
            You must respond ONLY with a raw, valid JSON object that exactly matches this schema:
            {EvaluationResult.model_json_schema()}
            Do not include markdown blocks, just the JSON string.
            """
            
            completion = self.groq_client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": self.system_prompt + "\n" + schema_instructions},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                response_format={"type": "json_object"}
            )
            
            result_dict = json.loads(completion.choices[0].message.content)
            return EvaluationResult(**result_dict)