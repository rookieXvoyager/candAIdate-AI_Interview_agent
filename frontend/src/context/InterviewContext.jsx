import { createContext, useContext, useState } from "react";

// Holds the data that flows across the multi-step interview funnel:
// profile (from /parse) → assessment + sessionId (from /generate-mcq)
// → transcript/score → evaluation (from /evaluate).
const InterviewContext = createContext(null);

export function InterviewProvider({ children }) {
  const [profile, setProfile] = useState(null); // ParsedProfile
  const [assessment, setAssessment] = useState(null); // { questions: [...] }
  const [sessionId, setSessionId] = useState(null); // sess_xxxxxxxx
  const [quizScore, setQuizScore] = useState(null); // { correct, total }
  const [evaluation, setEvaluation] = useState(null); // coach feedback

  const reset = () => {
    setProfile(null);
    setAssessment(null);
    setSessionId(null);
    setQuizScore(null);
    setEvaluation(null);
  };

  const value = {
    profile,
    setProfile,
    assessment,
    setAssessment,
    sessionId,
    setSessionId,
    quizScore,
    setQuizScore,
    evaluation,
    setEvaluation,
    reset,
  };

  return (
    <InterviewContext.Provider value={value}>
      {children}
    </InterviewContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useInterview() {
  const ctx = useContext(InterviewContext);
  if (!ctx)
    throw new Error("useInterview must be used within an InterviewProvider");
  return ctx;
}
