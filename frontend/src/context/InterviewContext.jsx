import { createContext, useContext, useEffect, useState } from "react";

const InterviewContext = createContext(null);

function readTaggedResult(key, sessionId) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!value) return null;
    if (!sessionId || value.session_id !== sessionId) return null;
    return value;
  } catch {
    return null;
  }
}

export function InterviewProvider({ children }) {
  const [storedSessionId] = useState(
    () => sessionStorage.getItem("candAIdate.sessionId") || null
  );
  const [profile, setProfile] = useState(null);
  const [assessment, setAssessment] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("candAIdate.assessment") || "null");
    } catch {
      return null;
    }
  });
  const [sessionId, setSessionIdState] = useState(() => storedSessionId);
  const [quizScore, setQuizScore] = useState(null);
  const [mcqResult, setMcqResultState] = useState(
    () => readTaggedResult("candAIdate.mcqResult", storedSessionId)
  );
  const [codingResult, setCodingResultState] = useState(
    () => readTaggedResult("candAIdate.codingResult", storedSessionId)
  );
  const [evaluation, setEvaluationState] = useState(
    () => readTaggedResult("candAIdate.evaluation", storedSessionId)
  );

  const clearResultStorage = () => {
    sessionStorage.removeItem("candAIdate.mcqResult");
    sessionStorage.removeItem("candAIdate.codingResult");
    sessionStorage.removeItem("candAIdate.evaluation");
  };

  const setSessionId = (newId) => {
    const normalizedId = newId || null;
    setSessionIdState((currentId) => {
      if (currentId !== normalizedId) {
        setMcqResultState(null);
        setCodingResultState(null);
        setEvaluationState(null);
        clearResultStorage();
      }
      return normalizedId;
    });
  };

  const setMcqResult = (value) => {
    setMcqResultState(
      value ? { ...value, session_id: sessionId } : null
    );
  };

  const setCodingResult = (value) => {
    setCodingResultState(
      value ? { ...value, session_id: sessionId } : null
    );
  };

  const setEvaluation = (value) => {
    setEvaluationState(
      value ? { ...value, session_id: sessionId } : null
    );
  };

  const resetInterviewSession = () => {
    setProfile(null);
    setAssessment(null);
    setSessionIdState(null);
    setQuizScore(null);
    setMcqResultState(null);
    setCodingResultState(null);
    setEvaluationState(null);
    clearResultStorage();
    sessionStorage.removeItem("candAIdate.assessment");
    sessionStorage.removeItem("candAIdate.sessionId");
  };

  useEffect(() => {
    if (sessionId) {
      sessionStorage.setItem("candAIdate.sessionId", sessionId);
    } else {
      sessionStorage.removeItem("candAIdate.sessionId");
    }
  }, [sessionId]);

  useEffect(() => {
    if (assessment) {
      sessionStorage.setItem("candAIdate.assessment", JSON.stringify(assessment));
    } else {
      sessionStorage.removeItem("candAIdate.assessment");
    }
  }, [assessment]);

  useEffect(() => {
    if (mcqResult) {
      sessionStorage.setItem(
        "candAIdate.mcqResult",
        JSON.stringify({ ...mcqResult, session_id: sessionId })
      );
    } else {
      sessionStorage.removeItem("candAIdate.mcqResult");
    }
  }, [mcqResult, sessionId]);

  useEffect(() => {
    if (codingResult) {
      sessionStorage.setItem(
        "candAIdate.codingResult",
        JSON.stringify({ ...codingResult, session_id: sessionId })
      );
    } else {
      sessionStorage.removeItem("candAIdate.codingResult");
    }
  }, [codingResult, sessionId]);

  useEffect(() => {
    if (evaluation) {
      sessionStorage.setItem(
        "candAIdate.evaluation",
        JSON.stringify({ ...evaluation, session_id: sessionId })
      );
    } else {
      sessionStorage.removeItem("candAIdate.evaluation");
    }
  }, [evaluation, sessionId]);

  const value = {
    profile,
    setProfile,
    assessment,
    setAssessment,
    sessionId,
    setSessionId,
    quizScore,
    setQuizScore,
    mcqResult,
    setMcqResult,
    codingResult,
    setCodingResult,
    evaluation,
    setEvaluation,
    reset: resetInterviewSession,
    resetInterviewSession,
  };

  return (
    <InterviewContext.Provider value={value}>
      {children}
    </InterviewContext.Provider>
  );
}

export function useInterview() {
  const ctx = useContext(InterviewContext);
  if (!ctx) throw new Error("useInterview must be used within an InterviewProvider");
  return ctx;
}
