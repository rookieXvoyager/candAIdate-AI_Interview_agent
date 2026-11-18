# POST /api/v1/evaluate/{session_id}
import asyncio
import uuid
from fastapi import APIRouter, HTTPException
from google.cloud import firestore

from app.agents.coach import CoachingAgent
from app.core.db import db


router = APIRouter()
coach_agent = CoachingAgent()


def _clamp_score(value) -> int:
    try:
        return max(0, min(100, int(round(float(value)))))
    except (TypeError, ValueError):
        return 0


def fallback_overall_feedback(
    *,
    ended_early: bool,
    candidate_answer_count: int,
    mcq_score: int,
    coding_score: int,
    coding_present: bool,
) -> dict:
    if candidate_answer_count == 0:
        executive_summary = (
            "The interview ended before any candidate responses were recorded."
        )
        interview_summary = (
            "No live-interview answers were available, so the interview section "
            "could not demonstrate performance."
        )
        weaknesses = ["Complete the live interview and answer the questions"]
        verdict = "Needs more practice"
    else:
        executive_summary = (
            "The interview was completed with partial candidate coverage."
        )
        interview_summary = (
            "The available live-interview responses were assessed, but coverage "
            "was incomplete."
        )
        weaknesses = ["Complete unanswered interview topics"]
        verdict = "Partially ready"

    section_feedback = {
        "mcq": {
            "score": mcq_score,
            "summary": (
                "MCQ performance was calculated deterministically from submitted answers."
                if mcq_score or candidate_answer_count
                else "No MCQ responses were available."
            ),
            "strengths": [],
            "improvements": (
                ["Review missed MCQ topics"]
                if mcq_score < 100
                else ["Maintain your current MCQ performance"]
            ),
        },
        "interview": {
            "score": 0,
            "summary": interview_summary,
            "strengths": (
                ["Candidate participated in the live interview"]
                if candidate_answer_count
                else []
            ),
            "improvements": weaknesses,
        },
    }
    if coding_present:
        section_feedback["coding"] = {
            "score": coding_score,
            "summary": (
                "Coding performance was calculated from persisted Judge0 test-case results."
                if coding_score or candidate_answer_count
                else "No coding submission was available."
            ),
            "strengths": [],
            "improvements": (
                ["Complete the coding round and address failed test cases"]
                if coding_score < 100
                else ["Maintain your coding implementation quality"]
            ),
        }

    return {
        "score": 0,
        "overall_score": 0,
        "strengths": [],
        "weaknesses": weaknesses,
        "detailed_feedback": executive_summary,
        "ended_early": ended_early,
        "candidate_answer_count": candidate_answer_count,
        "metrics": [],
        "score_breakdown": {},
        "section_feedback": section_feedback,
        "overall_feedback": {
            "verdict": verdict,
            "executive_summary": executive_summary,
            "key_strengths": [],
            "priority_improvements": weaknesses,
            "next_steps": [
                "Review the section feedback",
                "Complete or retry incomplete assessment sections",
            ],
        },
    }


def build_section_scores(session_data: dict) -> tuple[dict, bool]:
    mcq_result = session_data.get("mcq_result") or {}
    mcq_answers = session_data.get("mcq_answers")
    mcq_raw = mcq_result.get("percentage")
    if mcq_raw is None and isinstance(mcq_answers, list):
        mcq_quiz = session_data.get("mcq_quiz") or {}
        questions = mcq_quiz.get("questions") or []
        correct = sum(
            1
            for index, question in enumerate(questions)
            if index < len(mcq_answers)
            and mcq_answers[index]
            and str(mcq_answers[index]).strip().upper()
            == str(question.get("correct_answer", "")).strip().upper()
        )
        mcq_raw = (correct / len(questions) * 100) if questions else 0
    mcq_score = _clamp_score(mcq_raw)
    mcq_attempted = bool(mcq_result) or isinstance(mcq_answers, list)

    coding_result = session_data.get("coding_result") or {}
    coding_problem = session_data.get("coding_problem") or session_data.get("coding_questions")
    coding_present = bool(coding_result or coding_problem)
    coding_raw = 0
    coding_attempted = False

    if coding_present:
        passed = coding_result.get("passed")
        total = coding_result.get("total")
        if total is not None:
            try:
                total_int = int(total)
                passed_int = int(passed or 0)
                coding_raw = (
                    passed_int / total_int * 100
                    if total_int > 0
                    else 0
                )
                coding_attempted = not bool(coding_result.get("skipped")) and total_int > 0
            except (TypeError, ValueError):
                coding_raw = 0
        if isinstance(coding_result, dict) and coding_result.get("skipped"):
            coding_raw = 0
            coding_attempted = False

    scores = {
        "mcq": {
            "raw_score": mcq_score,
            "attempted": mcq_attempted,
        },
        "coding": {
            "raw_score": _clamp_score(coding_raw),
            "attempted": coding_attempted,
        },
        "interview": {
            "raw_score": 0,
            "attempted": False,
        },
    }
    return scores, coding_present


def build_score_breakdown(
    section_scores: dict,
    coding_present: bool,
) -> dict:
    if coding_present:
        weights = {"mcq": 25, "coding": 35, "interview": 40}
    else:
        weights = {"mcq": 40, "coding": 0, "interview": 60}

    breakdown = {}
    for key in ("mcq", "coding", "interview"):
        if key == "coding" and not coding_present:
            continue
        raw_score = _clamp_score(section_scores[key]["raw_score"])
        weight = weights[key]
        contribution = round(raw_score * weight / 100)
        labels = {
            "mcq": "MCQs",
            "coding": "Coding",
            "interview": "Live Interview",
        }
        breakdown[key] = {
            "key": key,
            "label": labels[key],
            "raw_score": raw_score,
            "weight_percent": weight,
            "weighted_contribution": contribution,
            "attempted": bool(section_scores[key]["attempted"]),
        }
    return breakdown


async def save_evaluation_report(session_id: str, evaluation_data: dict) -> str:
    evaluation_id = f"eval_{uuid.uuid4().hex[:8]}"
    batch = db.batch()
    eval_ref = db.collection("evaluations").document(evaluation_id)
    overall_score = _clamp_score(
        evaluation_data.get("overall_score", evaluation_data.get("score", 0))
    )

    eval_ref_data = {
        "sessionId": session_id,
        "score": overall_score,
        "overall_score": overall_score,
        "strengths": evaluation_data.get("strengths") or [],
        "weaknesses": evaluation_data.get("weaknesses") or [],
        "detailed_feedback": (
            evaluation_data.get("detailed_feedback")
            or "No detailed feedback was generated."
        ),
        "score_breakdown": evaluation_data.get("score_breakdown") or {},
        "section_feedback": evaluation_data.get("section_feedback") or {},
        "overall_feedback": evaluation_data.get("overall_feedback") or {},
        "ended_early": bool(evaluation_data.get("ended_early", False)),
        "candidate_answer_count": int(
            evaluation_data.get("candidate_answer_count", 0)
        ),
        "metrics": evaluation_data.get("metrics") or [],
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    batch.set(eval_ref, eval_ref_data)

    session_ref = db.collection("sessions").document(session_id)
    batch.update(
        session_ref,
        {
            "status": "completed",
            "evaluation_id": evaluation_id,
            "overall_score": overall_score,
            "score": overall_score,
            "score_breakdown": evaluation_data.get("score_breakdown") or {},
            "section_feedback": evaluation_data.get("section_feedback") or {},
            "overall_feedback": evaluation_data.get("overall_feedback") or {},
            "ended_early": bool(evaluation_data.get("ended_early", False)),
            "evaluation_report": evaluation_data,
        },
    )
    batch.commit()
    return evaluation_id


@router.post("/{session_id}")
async def evaluate_interview_session(session_id: str):
    session_ref = db.collection("sessions").document(session_id)
    session_snapshot = session_ref.get()
    if not session_snapshot.exists:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    session_data = session_snapshot.to_dict() or {}

    if session_data.get("status") == "completed":
        stored_report = session_data.get("evaluation_report")
        evaluation_id = session_data.get("evaluation_id")
        if isinstance(stored_report, dict) and stored_report:
            stored_report["overall_score"] = _clamp_score(
                stored_report.get(
                    "overall_score",
                    stored_report.get("score", 0),
                )
            )
            stored_report["score"] = stored_report["overall_score"]
            stored_report["score_breakdown"] = (
                stored_report.get("score_breakdown") or {}
            )
            stored_report["section_feedback"] = (
                stored_report.get("section_feedback") or {}
            )
            stored_report["overall_feedback"] = (
                stored_report.get("overall_feedback") or {}
            )
            return {
                "status": "success",
                "evaluation_id": evaluation_id,
                "data": stored_report,
                "idempotent": True,
            }
        if evaluation_id:
            existing = db.collection("evaluations").document(evaluation_id).get()
            if existing.exists:
                data = existing.to_dict() or {}
                data["overall_score"] = _clamp_score(
                    data.get("overall_score", data.get("score", 0))
                )
                data["score"] = data["overall_score"]
                data["score_breakdown"] = data.get("score_breakdown") or {}
                data["section_feedback"] = data.get("section_feedback") or {}
                data["overall_feedback"] = data.get("overall_feedback") or {}
                data["strengths"] = data.get("strengths") or []
                data["weaknesses"] = data.get("weaknesses") or []
                data["detailed_feedback"] = (
                    data.get("detailed_feedback")
                    or "No detailed feedback was generated."
                )
                data["metrics"] = data.get("metrics") or []
                data["ended_early"] = bool(data.get("ended_early", True))
                data["candidate_answer_count"] = int(
                    data.get("candidate_answer_count", 0)
                )
                return {
                    "status": "success",
                    "evaluation_id": evaluation_id,
                    "data": data,
                    "idempotent": True,
                }

    target_role = session_data.get("targetRole", "Software Engineer")
    transcript_list = session_data.get("transcript") or []
    if not isinstance(transcript_list, list):
        transcript_list = []

    candidate_turns = [
        message
        for message in transcript_list
        if isinstance(message, dict)
        and str(message.get("speaker", "")).lower() == "candidate"
        and str(message.get("text", "")).strip()
    ]
    candidate_answer_count = len(candidate_turns)

    section_scores, coding_present = build_section_scores(session_data)

    if candidate_answer_count == 0:
        eval_dict = fallback_overall_feedback(
            ended_early=True,
            candidate_answer_count=0,
            mcq_score=section_scores["mcq"]["raw_score"],
            coding_score=section_scores["coding"]["raw_score"],
            coding_present=coding_present,
        )
        score_breakdown = build_score_breakdown(section_scores, coding_present)
        section_scores["interview"]["raw_score"] = 0
        section_scores["interview"]["attempted"] = False
        score_breakdown = build_score_breakdown(section_scores, coding_present)
        eval_dict["score_breakdown"] = score_breakdown
        eval_dict["overall_score"] = _clamp_score(
            sum(item["weighted_contribution"] for item in score_breakdown.values())
        )
        eval_dict["score"] = eval_dict["overall_score"]
        eval_dict["section_feedback"]["interview"]["score"] = 0
        if coding_present:
            eval_dict["section_feedback"]["coding"]["score"] = (
                section_scores["coding"]["raw_score"]
            )
        evaluation_id = await save_evaluation_report(session_id, eval_dict)
        return {
            "status": "success",
            "evaluation_id": evaluation_id,
            "data": eval_dict,
            "fallback": True,
        }

    formatted_transcript = "\n".join(
        [
            f"{message.get('speaker', 'Unknown')}:"
            f"{message.get('text', '')}"
            for message in transcript_list
            if isinstance(message, dict)
        ]
    )

    try:
        evaluation_result = await asyncio.to_thread(
            coach_agent.evaluate_interview,
            target_role,
            formatted_transcript,
            {
                "mcq": section_scores["mcq"],
                "coding_present": coding_present,
                "coding": section_scores["coding"],
                "candidate_answer_count": candidate_answer_count,
            },
        )
        eval_dict = evaluation_result.model_dump()
        interview_score = _clamp_score(
            eval_dict.get("score", eval_dict.get("overall_score", 0))
        )
        section_scores["interview"]["raw_score"] = interview_score
        section_scores["interview"]["attempted"] = True

        score_breakdown = build_score_breakdown(section_scores, coding_present)
        overall_score = _clamp_score(
            sum(item["weighted_contribution"] for item in score_breakdown.values())
        )

        section_feedback = eval_dict.get("section_feedback") or {}
        section_feedback["mcq"] = {
            "score": section_scores["mcq"]["raw_score"],
            "summary": (
                section_feedback.get("mcq", {}).get("summary")
                or "MCQ performance based on submitted answers."
            ),
            "strengths": section_feedback.get("mcq", {}).get("strengths") or [],
            "improvements": (
                section_feedback.get("mcq", {}).get("improvements") or []
            ),
        }
        section_feedback["interview"] = {
            "score": interview_score,
            "summary": (
                section_feedback.get("interview", {}).get("summary")
                or "Live interview performance based on candidate answers."
            ),
            "strengths": (
                section_feedback.get("interview", {}).get("strengths") or []
            ),
            "improvements": (
                section_feedback.get("interview", {}).get("improvements") or []
            ),
        }
        if coding_present:
            section_feedback["coding"] = {
                "score": section_scores["coding"]["raw_score"],
                "summary": (
                    section_feedback.get("coding", {}).get("summary")
                    or "Coding performance based on Judge0 test-case results."
                ),
                "strengths": (
                    section_feedback.get("coding", {}).get("strengths") or []
                ),
                "improvements": (
                    section_feedback.get("coding", {}).get("improvements") or []
                ),
            }

        overall_feedback = eval_dict.get("overall_feedback") or {}
        overall_feedback = {
            "verdict": overall_feedback.get("verdict")
            or ("Strong readiness" if overall_score >= 75 else "Needs more practice"),
            "executive_summary": (
                overall_feedback.get("executive_summary")
                or "The assessment combined MCQ, coding, and interview performance."
            ),
            "key_strengths": overall_feedback.get("key_strengths") or [],
            "priority_improvements": (
                overall_feedback.get("priority_improvements") or []
            ),
            "next_steps": overall_feedback.get("next_steps") or [],
        }

        eval_dict["score"] = overall_score
        eval_dict["overall_score"] = overall_score
        eval_dict["score_breakdown"] = score_breakdown
        eval_dict["section_feedback"] = section_feedback
        eval_dict["overall_feedback"] = overall_feedback
        eval_dict["strengths"] = eval_dict.get("strengths") or []
        eval_dict["weaknesses"] = eval_dict.get("weaknesses") or []
        eval_dict["detailed_feedback"] = (
            eval_dict.get("detailed_feedback")
            or overall_feedback["executive_summary"]
        )
        eval_dict["ended_early"] = bool(
            session_data.get("ended_early", False)
        )
        eval_dict["candidate_answer_count"] = candidate_answer_count
        eval_dict["metrics"] = eval_dict.get("metrics") or []

        evaluation_id = await save_evaluation_report(session_id, eval_dict)
        return {
            "status": "success",
            "evaluation_id": evaluation_id,
            "data": eval_dict,
        }

    except Exception as error:
        print(f"🚨 [Coach fallback] {error}")
        eval_dict = fallback_overall_feedback(
            ended_early=True,
            candidate_answer_count=candidate_answer_count,
            mcq_score=section_scores["mcq"]["raw_score"],
            coding_score=section_scores["coding"]["raw_score"],
            coding_present=coding_present,
        )
        score_breakdown = build_score_breakdown(section_scores, coding_present)
        eval_dict["score_breakdown"] = score_breakdown
        eval_dict["overall_score"] = _clamp_score(
            sum(item["weighted_contribution"] for item in score_breakdown.values())
        )
        eval_dict["score"] = eval_dict["overall_score"]
        evaluation_id = await save_evaluation_report(session_id, eval_dict)
        return {
            "status": "success",
            "evaluation_id": evaluation_id,
            "data": eval_dict,
            "fallback": True,
        }
