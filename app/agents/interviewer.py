# Groq ReAct loop logic
import os
import yaml
import asyncio
from google import genai
from google.genai import types
from app.core.config import settings

class InterviewerAgent:
    def __init__(self, candidate_name:str, target_role: str, profile_summary:str):
        self.client=genai.Client(api_key=settings.GEMINI_API_KEY)
        self.candidate_name=candidate_name
        self.target_role = target_role
        self.profile_summary=profile_summary
        self.system_prompt= self._load_system_prompt()
        self.chat_session=self.client.chats.create(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(
                system_instruction=self.system_prompt,
                temperature=0.7
            )

        )

    def _load_system_prompt(self)->str:
        prompt_path = os.path.join(os.path.dirname(__file__),"..", "prompts", "interviewer_v1.yaml")
        try:
            with open(prompt_path,"r") as file:
                prompt_data = yaml.safe_load(file)
            base_prompt=prompt_data.get("system_instruction","You are a technical interviewer.")
        except FileNotFoundError:
            base_prompt="You are an expert technical interviewer."
        
        return f"""
        {base_prompt}
        CURRENT INTERVIEW CONTEXT:
        Candidate name:{self.candidate_name}
        Target role: {self.target_role}
        Candidate background: {self.profile_summary}

        Begin the interview by warmly welcoming the candidate by name and asking your first technical question based on their background.
"""
    
    async def generate_response(self, user_message:str)->str:
        # run the synchronous GenAI chat call in a bg thread
        #  ensures WebSocket event loop is never blocked
        response =await asyncio.to_thread(
            self.chat_session.send_message,
            user_message
        )
        return response.text