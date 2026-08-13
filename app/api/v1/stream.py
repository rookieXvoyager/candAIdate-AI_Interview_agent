from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from fastapi.security import HTTPAuthorizationCredentials
import json
import httpx
import asyncio
import traceback
from google.cloud import firestore

from app.services.azure_speech import transcribe_audio_to_text, generate_speech_from_text
from app.agents.interviewer import InterviewerAgent
from app.core.security import verify_firebase_token
from app.core.db import db

router = APIRouter()

@router.websocket("/stream/{session_id}")
async def interview_stream(websocket: WebSocket, session_id: str, token: str = Query(None)):
    """
    The Live Sandbox WebSocket Connection (Now DB-Aware).
    """
    await websocket.accept()
    
    # ==========================================
    # 1. AUTHENTICATION
    # ==========================================
    try:
        if token:
            creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
            await verify_firebase_token(creds)
            print("🔐 [WebSocket] Token authenticated successfully.")
        else:
            print("🔓 [WebSocket] Auth bypassed.")
    except Exception as e:
        print(f"🚨 Auth failed: {e}")
        await websocket.close(code=1008)
        return

    # ==========================================
    # 2. DYNAMIC PROFILE FETCHING
    # ==========================================
    candidate_name = "Candidate"
    target_role = "Software Engineer"
    profile_summary = "Candidate preparing for a technical interview."
    
    try:
        session_ref = db.collection("sessions").document(session_id)
        session_doc = session_ref.get()
        
        if session_doc.exists:
            session_data = session_doc.to_dict()
            target_role = session_data.get("targetRole", target_role)
            db_uid = session_data.get("uid")
            
            # If we have a user ID, fetch their parsed resume profile
            if db_uid:
                user_doc = db.collection("users").document(db_uid).get()
                if user_doc.exists:
                    profile_data = user_doc.to_dict().get("profile", {})
                    candidate_name = profile_data.get("candidate_name", candidate_name)
                    
                    # Convert skills array to a readable string for the LLM
                    skills = profile_data.get("core_skills", [])
                    if skills:
                        profile_summary = ", ".join(skills) if isinstance(skills, list) else str(skills)
                        
            print(f"👤 [Profile Loaded] {candidate_name} applying for {target_role}")
        else:
            print("⚠️ [Warning] Session not found. Falling back to generic profile.")
            
    except Exception as e:
        print(f"🚨 [DB Fetch Error]: {e}")

    # ==========================================
    # 3. INITIALIZE AGENT
    # ==========================================
    agent = InterviewerAgent(
        candidate_name=candidate_name,
        target_role=target_role, 
        profile_summary=profile_summary
    )

    try:
        # Personalize the greeting!
        first_name = candidate_name.split()[0] if candidate_name != "Candidate" else "there"
        initial_message = f"Hi {first_name}! Let's get started. Could you briefly introduce yourself?"
        
        ai_audio_base64 = await generate_speech_from_text(initial_message)
        
        await websocket.send_json({
            "type": "ai_response",
            "text": initial_message,
            "audio_base64": ai_audio_base64
        })

        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            candidate_text = None

            if data.get("type") == "audio":
                print("🎙️ [STT] Processing audio...")
                try:
                    candidate_text = await transcribe_audio_to_text(data.get("audio_base64", ""))
                    if candidate_text:
                        await websocket.send_json({"type": "user_text", "text": candidate_text})
                except Exception as e:
                    print(f"🚨 [STT Crash Guard] {e}")
            
            elif data.get("type") == "text":
                candidate_text = data.get("text", "")
                print(f"💬 [Text] Candidate typed: {candidate_text}")

            if candidate_text:
                print(f"🧠 [LLM] Generating response for: {candidate_text}")
                try:
                    ai_response_text = await agent.generate_response(candidate_text)
                    
                    # 🛡️ NULL-SAFE GUARD: Prevent Azure TTS from crashing
                    if not ai_response_text:
                        ai_response_text = "I'm having trouble connecting to my systems. Let's try that again."
                        
                    print(f"✅ [LLM] Response generated.")
                    ai_audio_base64 = await generate_speech_from_text(ai_response_text)
                except Exception as e:
                    print(f"🚨 [Agent/TTS Error]: {e}")
                    ai_response_text = "I'm sorry, my core logic encountered an error."
                    ai_audio_base64 = None

                await websocket.send_json({
                    "type": "ai_response",
                    "text": ai_response_text,
                    "audio_base64": ai_audio_base64
                })

                def save_transcript():
                    try:
                        session_ref.update({
                            "transcript": firestore.ArrayUnion([
                                {"speaker": "Candidate", "text": candidate_text},
                                {"speaker": "Interviewer", "text": ai_response_text}
                            ])
                        })
                    except Exception as e:
                        print(f"🚨 [DB Save Error]: {e}")
                
                await asyncio.to_thread(save_transcript)
                
    except WebSocketDisconnect:
        print(f"🔴 [WebSocket] Disconnected: {session_id}")
        try:
            # Tell the database the session is ready to be evaluated
            session_ref.update({"status": "ready_for_evaluation"})
            print("📊 [Auto-Eval] Triggering Coaching Agent...")
            async with httpx.AsyncClient() as client:
                await client.post(f"http://127.0.0.1:8000/api/v1/evaluate/{session_id}")
        except Exception as e:
            print(f"🚨 [Auto-Eval Trigger Failed]: {e}")
    except Exception as e:
        print(f"🚨 [WebSocket FATAL ERROR]: {str(e)}")
        traceback.print_exc()