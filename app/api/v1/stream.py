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
    The Live Sandbox WebSocket Connection.
    """
    await websocket.accept()
    
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

    agent = InterviewerAgent(
        candidate_name="Candidate",
        target_role="Software Engineer", 
        profile_summary="Candidate preparing for a technical interview."
    )

    try:
        initial_message = "Hi there! Let's get started. Could you briefly introduce yourself?"
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
                        db.collection("sessions").document(session_id).update({
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
            print("📊 [Auto-Eval] Triggering Coaching Agent...")
            async with httpx.AsyncClient() as client:
                await client.post(f"http://127.0.0.1:8000/api/v1/evaluate/{session_id}")
        except Exception as e:
            print(f"🚨 [Auto-Eval Trigger Failed]: {e}")
    except Exception as e:
        print(f"🚨 [WebSocket FATAL ERROR]: {str(e)}")
        traceback.print_exc()