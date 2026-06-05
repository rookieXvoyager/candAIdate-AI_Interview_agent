from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.agents.interviewer import InterviewerAgent
from app.core.db import db

router =APIRouter()

@router.websocket("/stream/{session_id}")
async def interview_stream(websocket: WebSocket, session_id:str):
    await websocket.accept()

    
    try:
        session_ref=db.collection("sessions").document(session_id)
        session_doc=session_ref.get()
        
        if not session_doc.exists:
            await websocket.send_text("System error. Interview session not found.")
            await websocket.close(code=1008)
            return
        
        session_data=session_doc.to_dict()
        uid=session_data.get("uid")
        target_role=session_data.get("targetRole", "Software Engineer")

        # fetching USER Profile second using the uid from the session
        user_doc=db.collection("users").document(uid).get()
        profile_data=user_doc.to_dict().get("profile",{}) if user_doc.exists else {}

        candidate_name=profile_data.get("candidate_name", "Candidate")
        profile_summary=str(profile_data.get("core_skills", []))

        # Initializing the transcript array here
        transcript=session_data.get("transcript",[])

        agent =InterviewerAgent(
            candidate_name=candidate_name,
            target_role=target_role,
            profile_summary=profile_summary
        )

        initial_prompt="Hello, I am ready to begin the interview."
        welcome_msg= await agent.generate_response(initial_prompt)
        
        transcript.append({"speaker":"Interviewer", "text":welcome_msg})
        await websocket.send_text(welcome_msg)

        while True:
            user_msg =await websocket.receive_text()
            transcript.append({"speaker":"Candidate", "text":user_msg})

            ai_response=await agent.generate_response(user_msg)

            transcript.append({"speaker":"Interviewer", "text":ai_response})
            await websocket.send_text(ai_response)

    except WebSocketDisconnect:
        print(f"Session ended for candidate: {session_id}")
    except Exception as e:
        await websocket.send_text(f"Connection error: {str(e)}")
        await websocket.close()
    finally:
        # when transcript to firestore when wwebsocket closes
        if 'session_ref' in locals() and 'transcript' in locals() and transcript:
            session_ref.update({
                "transcript":transcript,
                "status":"ready_for_evaluation"
            })