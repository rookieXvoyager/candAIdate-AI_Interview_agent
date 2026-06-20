# Groq ReAct loop logic
import os
import yaml
import asyncio
from google import genai
from google.genai import types
from app.core.config import settings
from app.agents._gemini import is_quota_error

class InterviewerAgent:
    def __init__(self, candidate_name:str, target_role: str, profile_summary:str):
        self.client=genai.Client(api_key=settings.GEMINI_API_KEY)
        self.candidate_name=candidate_name
        self.target_role = target_role
        self.profile_summary=profile_summary
        self.system_prompt= self._load_system_prompt()
        self._models = settings.resolved_models
        self._model_idx = 0
        self.chat_session = self._new_session()

    def _new_session(self):
        return self.client.chats.create(
            model=self._models[self._model_idx],
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
    
    def _send(self, user_message:str)->str:
        # Try the current model; on a rate-limit, advance to the next model.
        # (Rebuilding the session drops prior turns, but that only happens when
        #  the active model is throttled — better than failing the interview.)
        while True:
            try:
                return self.chat_session.send_message(user_message).text
            except Exception as exc:
                if is_quota_error(exc) and self._model_idx < len(self._models) - 1:
                    self._model_idx += 1
                    self.chat_session = self._new_session()
                    continue
                raise

    async def generate_response(self, user_message:str)->str:
        # run the synchronous GenAI chat call in a bg thread
        #  ensures WebSocket event loop is never blocked
        return await asyncio.to_thread(self._send, user_message)