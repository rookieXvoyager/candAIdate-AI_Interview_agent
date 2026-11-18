import os
import asyncio
import json
import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from firebase_admin import auth  # NEW: Import Firebase auth for manual token verification
from app.agents.interviewer import InterviewerAgent
from app.core.db import db

router = APIRouter()

async def heartbeat_task(websocket: WebSocket, ping_interval: int = 15):
    """
    Bg task that sends ping to client's frontend every ping_interval seconds
    If the socket is closed, they will silently fail and exit
    """
    try:
        while True:
            await asyncio.sleep(ping_interval)
            await websocket.send_text(json.dumps({"type": "ping"}))
    except Exception:
        pass
        # Connection closed, bg task gracefully dies

@router.websocket("/stream/{session_id}")
async def interview_stream(
    websocket: WebSocket, 
    session_id: str,
    token: str = Query(None) # NEW: Require token as a query parameter
):
    await websocket.accept()

    # ==========================================
    # NEW: 1. AUTHENTICATION LAYER
    # ==========================================
    if not token:
        await websocket.send_text("Connection rejected: No authentication token provided.")
        await websocket.close(code=1008)
        return

    try:
        decoded_token = auth.verify_id_token(token)
        verified_uid = decoded_token.get("uid")
    except Exception as e:
        await websocket.send_text("Connection rejected: Invalid or expired token.")
        await websocket.close(code=1008)
        return

    ping_task = asyncio.create_task(heartbeat_task(websocket, ping_interval=15))
    
    try: 
        session_ref = db.collection("sessions").document(session_id)
        session_doc = session_ref.get()
        
        if not session_doc.exists:
            await websocket.send_text("System error. Interview session not found.")
            await websocket.close(code=1008)
            return
        
        session_data = session_doc.to_dict()
        db_uid = session_data.get("uid")

        # ==========================================
        # NEW: 2. TENANCY LAYER (DATA SCOPING)
        # ==========================================
        if db_uid != verified_uid:
            await websocket.send_text("Connection rejected: You do not have permission to access this session.")
            await websocket.close(code=1008)
            return

        target_role = session_data.get("targetRole", "Software Engineer")

        # fetching USER Profile using the VERIFIED uid
        user_doc = db.collection("users").document(verified_uid).get()
        profile_data = user_doc.to_dict().get("profile", {}) if user_doc.exists else {}

        candidate_name = profile_data.get("candidate_name", "Candidate")
        profile_summary = str(profile_data.get("core_skills", []))

        # Initializing the transcript array here
        transcript = session_data.get("transcript", [])

        agent = InterviewerAgent(
            candidate_name=candidate_name,
            target_role=target_role,
            profile_summary=profile_summary
        )

        initial_prompt = "Hello, I am ready to begin the interview."
        welcome_msg = await agent.generate_response(initial_prompt)
        welcome_complete = "[INTERVIEW_COMPLETE]" in welcome_msg
        welcome_msg = welcome_msg.replace("[INTERVIEW_COMPLETE]", "").strip()
        transcript.append({"speaker": "Interviewer", "text": welcome_msg})
        await websocket.send_text(json.dumps({
            "type": "ai_message",
            "content": welcome_msg,
            "text": welcome_msg,
            "interview_complete": welcome_complete,
        }))
        candidate_answer_count = 0

        while True:
            try:
                user_msg = await asyncio.wait_for(websocket.receive_text(), timeout=450.0)
                msg_data = {}
                try:
                    msg_data = json.loads(user_msg)
                    if msg_data.get("type") == "pong":
                        continue
                except json.JSONDecodeError:
                    pass

                if isinstance(msg_data, dict) and msg_data.get("type") == "text":
                    candidate_text = str(msg_data.get("text", "")).strip()
                else:
                    candidate_text = user_msg.strip()
                if not candidate_text:
                    continue

                candidate_answer_count += 1
                transcript.append({"speaker": "Candidate", "text": candidate_text})

                ai_response = await agent.generate_response(candidate_text)
                interview_complete = (
                    "[INTERVIEW_COMPLETE]" in ai_response
                    or candidate_answer_count >= 7
                )
                clean_response = ai_response.replace(
                    "[INTERVIEW_COMPLETE]",
                    "",
                ).strip()
                if not clean_response:
                    clean_response = "Thank you. That concludes the interview."

                transcript.append({"speaker": "Interviewer", "text": clean_response})
                await websocket.send_text(json.dumps({
                    "type": "ai_message",
                    "content": clean_response,
                    "text": clean_response,
                    "interview_complete": interview_complete,
                }))
                if interview_complete:
                    await websocket.send_text(json.dumps({
                        "type": "interview_complete",
                        "content": clean_response,
                        "text": clean_response,
                    }))
            
            except asyncio.TimeoutError:
                print(f"Session {session_id} timed out. Zombie connection detected.")
                break
            
    except WebSocketDisconnect:
        print(f"Session ended for candidate: {session_id}")
    except Exception as e:
        await websocket.send_text(f"Connection error: {str(e)}")
        await websocket.close()
    finally:
        # cancel the background ping task so that it doesn't run forever
        if 'ping_task' in locals():
            ping_task.cancel()
            
        # save transcript to firestore when websocket closes
        if 'session_ref' in locals():
            saved_transcript = transcript if 'transcript' in locals() and isinstance(transcript, list) else []
            session_ref.update({
                "transcript": saved_transcript,
                "status": "ready_for_evaluation",
                "ended_early": True,
            })
            print(f"Transcript saved for session {session_id}")
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    await client.post(
                        f"http://backend:8000/api/v1/evaluate/{session_id}"
                    )
            except Exception as exc:
                print(f"Auto-evaluation trigger failed: {exc}")