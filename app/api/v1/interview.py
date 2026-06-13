import os
import asyncio
import json
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
        
        transcript.append({"speaker": "Interviewer", "text": welcome_msg})
        await websocket.send_text(welcome_msg)

        while True:
            try:
                user_msg = await asyncio.wait_for(websocket.receive_text(), timeout=450.0)
                try:
                    msg_data = json.loads(user_msg)
                    if msg_data.get("type") == "pong":
                        continue
                except json.JSONDecodeError:
                    pass

                transcript.append({"speaker": "Candidate", "text": user_msg})

                ai_response = await agent.generate_response(user_msg)

                transcript.append({"speaker": "Interviewer", "text": ai_response})
                await websocket.send_text(ai_response)
            
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
        if 'session_ref' in locals() and 'transcript' in locals() and transcript:
            session_ref.update({
                "transcript": transcript,
                "status": "ready_for_evaluation"
            })
            print(f"Transcript saved for session {session_id}")