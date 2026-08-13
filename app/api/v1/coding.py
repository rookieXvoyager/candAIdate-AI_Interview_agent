import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

try:
    from app.core.db import db
except ImportError:
    try:
        from app.core.firebase import db
    except ImportError:
        db = None

router = APIRouter(tags=["coding"])

# ---------------------------------------------------------------------------
# Judge0 Configuration & Mappings
# ---------------------------------------------------------------------------
# Points to the internal Docker service name, not localhost!
JUDGE0_URL   = "http://judge0-server:2358"
JUDGE0_TOKEN = "YourSecureToken"   # Must match AUTHN_TOKEN in your judge0.conf

HEADERS = {
    "Content-Type":  "application/json",
    "X-Auth-Token":  JUDGE0_TOKEN,
}

# Judge0 CE language IDs
LANGUAGE_IDS = {
    "python":     71,   # Python 3.8.1
    "javascript": 63,   # Node.js 12.14.0
    "java":       62,   # Java (OpenJDK 13.0.1)
    "cpp":        54,   # C++ (GCC 9.2.0)
    "rust":       73,   # Rust 1.40.0
}

# Per-language cpu_time_limit sent with each submission (seconds)
# Java gets extra time to absorb the heavy JVM startup
CPU_LIMITS = {
    "java":       10,
    "cpp":        5,
    "rust":       5,
    "python":     5,
    "javascript": 5,
}

# Request Schemas
class ExecutionRequest(BaseModel):
    code: str
    language: str
    question_id: str
    custom_input: str | None = None

class SubmitRequest(BaseModel):
    code: str
    language: str
    question_id: str
    session_id: str | None = "current-session"


async def _submit_to_judge0(
    client: httpx.AsyncClient,
    source_code: str,
    language: str,
    stdin: str = "",
) -> dict:
    """POST a submission to Judge0 and wait synchronously for the result."""
    lang    = language.lower()
    lang_id = LANGUAGE_IDS.get(lang)
    if not lang_id:
        raise ValueError(f"Unsupported language: {language}")

    payload = {
        "source_code":    source_code,
        "language_id":    lang_id,
        "stdin":          stdin,
        "cpu_time_limit": CPU_LIMITS.get(lang, 5),
        "cpu_extra_time": 2,
        "wall_time_limit": CPU_LIMITS.get(lang, 5) + 5,
        "memory_limit":   524288,   # 512 MB in KB
    }

    # wait=true makes Judge0 block until execution completes (synchronous mode)
    response = await client.post(
        f"{JUDGE0_URL}/submissions?base64_encoded=false&wait=true",
        json=payload,
        headers=HEADERS,
        timeout=40.0,
    )
    response.raise_for_status()
    return response.json()


def _parse_judge0(data: dict) -> dict:
    """Normalize a Judge0 response into our standard frontend format."""
    status_id = data.get("status", {}).get("id", 13)
    stdout     = (data.get("stdout")         or "").strip()
    stderr     = (data.get("stderr")         or "").strip()
    ce_output  = (data.get("compile_output") or "").strip()

    if status_id == 3:          # Accepted
        return {"status": "success", "output": stdout or "No output.", "passed": True}
    elif status_id == 5:        # Time Limit Exceeded
        return {"status": "error",   "message": "Time Limit Exceeded: Your code took too long."}
    elif status_id == 6:        # Compilation Error
        return {"status": "error",   "message": f"Compilation Error:\n{ce_output}"}
    elif status_id == 12:       # Memory Limit Exceeded
        return {"status": "error",   "message": "Memory Limit Exceeded."}
    elif status_id in (7, 8, 9, 10, 11):  # Runtime Errors
        return {"status": "error",   "message": f"Runtime Error:\n{stderr or stdout}"}
    else:
        return {"status": "error",   "message": f"Execution failed (status {status_id}):\n{stderr}"}


# ---------------------------------------------------------------------------
# Route 1 — Fetch Questions
# ---------------------------------------------------------------------------
@router.get("/questions")
async def get_coding_questions():
    try:
        if db:
            docs = db.collection("coding_bank").limit(3).stream()
            questions = []
            for doc in docs:
                q_data = doc.to_dict()
                q_data.pop("hidden_test_cases", None)
                questions.append(q_data)
            if questions:
                return questions
        raise HTTPException(status_code=404, detail="No coding questions found.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Firestore error: {str(e)}")


# ---------------------------------------------------------------------------
# Route 2 — Run Code (Single Execution for Editor Console)
# ---------------------------------------------------------------------------
@router.post("/execute")
async def execute_code(req: ExecutionRequest):
    if req.language.lower() not in LANGUAGE_IDS:
        raise HTTPException(status_code=400, detail="Unsupported language")
    
    try:
        safe_input = (req.custom_input or "") + "\n"
        async with httpx.AsyncClient() as client:
            data = await _submit_to_judge0(client, req.code, req.language, safe_input)
        return _parse_judge0(data)
    except httpx.ConnectError:
        return {"status": "error", "message": "Cannot reach Judge0. Are the Docker containers running?"}
    except Exception as e:
        return {"status": "error", "message": f"Execution error: {e}"}


# ---------------------------------------------------------------------------
# Route 3 — Submit (Evaluate All Hidden Test Cases)
# ---------------------------------------------------------------------------
@router.post("/submit")
async def submit_question(req: SubmitRequest):
    if not db:
        return {"status": "error", "message": "Database not connected."}

    try:
        doc = db.collection("coding_bank").document(req.question_id).get()
    except Exception as e:
        return {"status": "error", "message": f"Firestore error: {e}"}

    if not doc.exists:
        return {"status": "error", "message": "Question not found."}

    hidden_cases = doc.to_dict().get("hidden_test_cases", [])
    if not hidden_cases:
        return {"status": "error", "message": "No hidden test cases found."}

    passed     = 0
    infra_fail = 0
    total      = len(hidden_cases)

    # Use a single AsyncClient session for all requests to avoid TCP overhead
    async with httpx.AsyncClient() as client:
        for idx, tc in enumerate(hidden_cases):
            try:
                safe_input = tc.get("input", "") + "\n"
                data       = await _submit_to_judge0(client, req.code, req.language, safe_input)
                result     = _parse_judge0(data)

                # Check if it was a compilation error so we can short-circuit early
                if data.get("status", {}).get("id") == 6:
                    print(f"[submit] TC {idx+1}: Compilation failed, stopping early.")
                    break

                if result["status"] == "success":
                    stdout   = data.get("stdout", "").strip()
                    expected = tc.get("expected_output", "").strip()
                    if stdout == expected:
                        passed += 1
                        print(f"[submit] TC {idx+1}: PASS")
                    else:
                        print(f"[submit] TC {idx+1}: WRONG — got {stdout[:60]!r}, expected {expected[:60]!r}")
                else:
                    print(f"[submit] TC {idx+1}: {result.get('message', '')[:80]}")

            except Exception as exc:
                print(f"[submit] TC {idx+1}: infra error — {exc}")
                infra_fail += 1

    result_payload: dict = {"status": "success", "passed": passed, "total": total}
    if infra_fail:
        result_payload["warning"] = f"{infra_fail} case(s) failed due to sandbox load. Resubmit to retry."
        
    return result_payload