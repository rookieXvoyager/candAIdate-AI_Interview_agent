# POST /api/v1/evaluate (Coaching Engine)
import uuid
import asyncio
from fastapi import APIRouter, HTTPException
from google.cloud import firestore

from app.core.db import db
from app.agents.coach import CoachingAgent

router=APIRouter()

coach_agent=CoachingAgent()

async def save_evaluation_report(session_id:str, evaluation_data: dict)->str:
    """
    Saves the structured evaluation to Firestore and updates the session status.
    """

    evaluation_id=f"eval_{uuid.uuid4().hex[:8]}"
    batch =db.batch()

    # Creating the evaluation doc
    eval_ref=db.collection("evaluations").document(evaluation_id)
    batch.set(eval_ref, 
              {
                  "sessionId":session_id,
                  "score":evaluation_data.get("score"),
                  "strengths":evaluation_data.get("strengths"),
                  "weaknesses":evaluation_data.get("weaknesses"),
                  "detailed_feedback":evaluation_data.get("detailed_feedback"),
                  "createdAt":firestore.SERVER_TIMESTAMP
              })
    # Update the original session to mark it as completed/evaluated
    session_ref=db.collection("sessions").document(session_id)
    batch.update(session_ref, 
                 {"status":"completed",
                  "evaluation_id":evaluation_id})
    batch.commit()
    return evaluation_id

@router.post("/{session_id}")
async def evaluate_interview_session(session_id:str):
    """
    Reads the completed interview transcript from Firestore, evaluates it using the Coaching Agent, and saves the detailed feedback.
    """

    # Fetching raw session data from firestore
    session_ref=db.collection("sessions").document(session_id).get()
    if not session_ref.exists:
        raise HTTPException(status_code=404, detail="Interview session not found.")
    
    session_data=session_ref.to_dict()
    target_role=session_data.get("targetRole", "Software Engineer")
    transcript_list= session_data.get("transcript",[])

    if not transcript_list:
        raise HTTPException(status_code=400, detail="Transcript is empty. No interview data to evaluate.")
    
    # format JSON transcript list into a readable string format
    formatted_transcript="\n".join(
        [f"{msg.get('speaker', 'Unknown')}:{msg.get('text','')}" for msg in transcript_list]

    )

    try:
        # Running the synchronous call in a seperate thread so FastUPI websockets arent blockeed
        evaluation_result=await asyncio.to_thread(
            coach_agent.evaluate_interview,
            target_role=target_role,
            transcript=formatted_transcript
        )

        # Save to Firestore
        eval_dict=evaluation_result.model_dump()
        evaluation_id =await save_evaluation_report(session_id, eval_dict)

        return {
            "status":"success",
            "evaluation_id":evaluation_id,
            "data":eval_dict
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Coaching agent failed to process report: {str(e)}")
    