import os
import yaml
import asyncio
import time
import traceback
from google import genai
from google.genai import types
from app.core.config import settings
from app.agents._gemini import is_quota_error

# Attempt to import Groq
try:
    from groq import Groq
except ImportError:
    Groq = None

class InterviewerAgent:
    def __init__(self, candidate_name:str, target_role: str, profile_summary:str):
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is missing from environment/config!")
            
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self.groq_client = Groq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY and Groq else None
        
        self.candidate_name = candidate_name
        self.target_role = target_role
        self.profile_summary = profile_summary
        self.system_prompt = self._load_system_prompt()
        
        # 🧠 UNIVERSAL HISTORY: Keeps context safe in case we switch models mid-interview
        self.history = [{"role": "system", "content": self.system_prompt}]
        self.using_groq = False # Flag to lock into Groq if Gemini fails permanently
        
        self._models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"]
        self._model_idx = 0
        self.chat_session = self._new_session()

    def _new_session(self):
        model = self._models[self._model_idx]
        print(f"🔄 [Agent] Initializing Gemini session with model: {model}")
        return self.client.chats.create(
            model=model,
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
        Candidate name: {self.candidate_name}
        Target role: {self.target_role}
        Candidate background: {self.profile_summary}

        Begin the interview by warmly welcoming the candidate by name and asking your first technical question based on their background.
        """
    
    def _send_with_groq(self) -> str:
        """Fallback Execution using Groq Llama-3"""
        if not self.groq_client:
            return "I apologize, my primary systems are down and backup is not configured."
            
        print("   -> 🚀 [Groq Fallback] Sending message to Llama-3-70B...")
        try:
            completion = self.groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=self.history,
                temperature=0.7,
                max_tokens=500
            )
            response_text = completion.choices[0].message.content
            self.history.append({"role": "assistant", "content": response_text})
            print("   -> 🚀 [Groq Fallback] Successfully received reply.")
            return response_text
        except Exception as e:
            print(f"   -> 🚨 [Groq Error]: {e}")
            return "I apologize, both my primary and backup AI systems are experiencing difficulties."

    def _send(self, user_message:str)->str:
        # 1. Always append user message to Universal History
        self.history.append({"role": "user", "content": user_message})

        # 2. If Gemini already died earlier in the interview, stick with Groq
        if self.using_groq:
            return self._send_with_groq()

        print(f"   -> [Gemini SDK] Sending message to {self._models[self._model_idx]}...")
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                response = self.chat_session.send_message(user_message)
                if response and response.text:
                    print(f"   -> [Gemini SDK] Successfully received reply.")
                    # Keep history in sync
                    self.history.append({"role": "assistant", "content": response.text})
                    return response.text
                return "I'm having trouble processing that."
            except Exception as exc:
                err_str = str(exc)
                print(f"   -> 🚨 [Gemini SDK Error - Attempt {attempt+1}/{max_retries}]: {err_str[:150]}...")
                
                # Quota hit -> Immediately switch Gemini models
                if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                    if self._model_idx < len(self._models) - 1:
                        print("   -> 🔄 [Quota Hit] Switching to next Gemini fallback model...")
                        self._model_idx += 1
                        self.chat_session = self._new_session()
                        continue
                    else:
                        print("   -> ⚠️ [Critical] Gemini completely exhausted! Handing off to Groq...")
                        self.using_groq = True
                        return self._send_with_groq()
                
                # Server Overload -> Wait and retry
                if "503" in err_str:
                    print("   -> ⏳ [Server Overloaded] Waiting 3 seconds...")
                    time.sleep(3)
                    continue

        # If it completely fails all retries, handoff to Groq
        print("   -> ⚠️ [Critical] Gemini failed after retries. Handing off to Groq...")
        self.using_groq = True
        return self._send_with_groq()

    async def generate_response(self, user_message:str)->str:
        try:
            return await asyncio.wait_for(asyncio.to_thread(self._send, user_message), timeout=25.0)
        except asyncio.TimeoutError:
            print("   -> 🚨 [Timeout] Agent took longer than 25 seconds to respond!")
            return "I apologize, my analysis is taking too long. Can we try rephrasing that?"
        except Exception as e:
            print(f"   -> 🚨 [Agent Async Error]: {e}")
            return "My systems encountered a critical error."