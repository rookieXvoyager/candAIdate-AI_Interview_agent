import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Target, BookOpen, Clock } from "lucide-react";
import { useInterview } from "../context/InterviewContext";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../lib/api";
import AppShell from "../components/AppShell";

const QUIZ_MINUTES = 10;

export default function Quiz() {
  const { assessment, sessionId, setQuizScore, mcqResult, setMcqResult } =
    useInterview();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const questions = useMemo(
    () => assessment?.questions || [],
    [assessment]
  );

  const validMcqResult =
    mcqResult &&
    mcqResult.session_id === sessionId;

  const [answers, setAnswers] = useState(() => {
    if (!validMcqResult || !Array.isArray(mcqResult?.breakdown)) return {};
    return mcqResult.breakdown.reduce((restored, item) => {
      if (item?.index != null && item?.user_answer != null) {
        restored[item.index] = item.user_answer;
      }
      return restored;
    }, {});
  });
  const [submitted, setSubmitted] = useState(Boolean(validMcqResult));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(QUIZ_MINUTES * 60);

  // If state was lost (hard refresh), send the user back to the start.
  useEffect(() => {
    if (!assessment) navigate("/dashboard", { replace: true });
  }, [assessment, navigate]);

  useEffect(() => {
    setAnswers({});
    setSubmitted(Boolean(validMcqResult));
    setShowSubmitConfirmation(false);
    setSubmitError("");
    setSecondsLeft(QUIZ_MINUTES * 60);
  }, [sessionId]);

  // --- Countdown Timer Logic ---
  useEffect(() => {
    if (submitted || !assessment) return;
    
    if (secondsLeft <= 0) {
      handleSubmit(true); // Auto-submit when time is up
      return;
    }
    
    const timer = setInterval(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [secondsLeft, submitted, assessment]);

  if (!assessment) return null;

  const score = questions.reduce(
    (acc, q, i) => (answers[i] === q.correct_answer ? acc + 1 : acc),
    0
  );
  const answeredCount = questions.reduce(
    (count, _question, index) =>
      answers[index] != null ? count + 1 : count,
    0
  );
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  const handleSelect = (qIndex, key) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qIndex]: key }));
  };

  const handleSubmit = async (automatic = false) => {
    if (submitted || isSubmitting) return;

    if (!automatic && unansweredCount > 0) {
      setShowSubmitConfirmation(true);
      return;
    }

    setShowSubmitConfirmation(false);
    setSubmitError("");
    setIsSubmitting(true);

    try {
      const normalizedAnswers = questions.map((_question, index) =>
        answers[index] == null ? null : answers[index]
      );

      let result = {
        correct: score,
        total: questions.length,
        unanswered: unansweredCount,
        percentage:
          questions.length > 0
            ? Math.round((score / questions.length) * 100)
            : 0,
      };

      if (sessionId) {
        const token = await getToken();
        const response = await fetch(
          `${API_BASE}/api/v1/setup/submit-mcq/${encodeURIComponent(sessionId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ answers: normalizedAnswers }),
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || `Submission failed (${response.status}).`);
        }

        const responseResult = await response.json();
        result = {
          correct: Number(responseResult.correct ?? 0),
          total: Number(responseResult.total ?? normalizedAnswers.length),
          unanswered: Number(responseResult.unanswered ?? 0),
          percentage: Number(
            responseResult.percentage ??
              (responseResult.total
                ? (responseResult.correct / responseResult.total) * 100
                : 0)
          ),
          breakdown: Array.isArray(responseResult.breakdown)
            ? responseResult.breakdown
            : [],
          session_id: sessionId,
        };
      }

      setMcqResult(result);
      setQuizScore({
        correct: result.correct,
        total: result.total,
      });
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setSubmitError(error.message || "Unable to submit your assessment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = () => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Warning state for the last 2 minutes
  const isTimeLow = secondsLeft <= 120 && !submitted;

  return (
    <AppShell step={3}>
      <div className="mx-auto max-w-3xl">
        
        {/* Header & Timer */}
        <div className="mb-8 text-center relative">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Pre-screen Assessment
          </h1>
          <p className="mt-2 text-slate-400">
            {submitted
              ? "Review your answers below, then start the coding assessment."
              : `Complete as many of the ${questions.length} questions as you can.`}
          </p>
          
          {/* Timer Display */}
          {!submitted && (
            <div className={`mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold border transition-colors ${
              isTimeLow 
                ? "border-rose-500/50 bg-rose-500/20 text-rose-400 animate-pulse" 
                : "border-brand-500/30 bg-brand-500/10 text-brand-400"
            }`}>
              <Clock className="h-4 w-4" />
              {formatTime()} remaining
            </div>
          )}
        </div>

        {submitted && (
          <div className="card mb-8 flex items-center justify-between p-6">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-400">
                Your Score
              </p>
              <p className="mt-1 text-3xl font-bold text-white">
                {mcqResult?.correct ?? score}
                <span className="text-lg text-slate-500">
                  {" "}
                  / {mcqResult?.total ?? questions.length}
                </span>
              </p>
              {mcqResult && (
                <p className="mt-1 text-sm text-slate-400">
                  {mcqResult.percentage}% correct
                  {mcqResult.unanswered > 0
                    ? ` · ${mcqResult.unanswered} unanswered`
                    : ""}
                </p>
              )}
            </div>
            <div className="text-right">
              {(mcqResult?.percentage ?? (questions.length ? (score / questions.length) * 100 : 0)) >= 60 ? (
                <Target className="h-9 w-9 text-emerald-300" />
              ) : (
                <BookOpen className="h-9 w-9 text-amber-300" />
              )}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {questions.map((q, qi) => (
            <div key={qi} className="card p-6">
              <div className="mb-4 flex gap-3">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-brand-600/20 text-sm font-semibold text-brand-400">
                  {qi + 1}
                </span>
                <p className="font-medium text-slate-100">{q.question}</p>
              </div>

              <div className="space-y-2">
                {(Array.isArray(q?.options) ? q.options : []).map((opt) => {
                  if (!opt?.key) return null;
                  const selected = answers[qi] === opt.key;
                  const isCorrect = opt.key === q?.correct_answer;
                  let cls =
                    "border-navy-700 bg-navy-950/40 hover:border-brand-500/50";
                  if (submitted) {
                    if (isCorrect)
                      cls =
                        "border-emerald-500/50 bg-emerald-500/10 text-emerald-200";
                    else if (selected)
                      cls = "border-rose-500/50 bg-rose-500/10 text-rose-200";
                    else cls = "border-navy-700 bg-navy-950/40 opacity-70";
                  } else if (selected) {
                    cls = "border-brand-500 bg-brand-600/15 text-white";
                  }

                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handleSelect(qi, opt.key)}
                      disabled={submitted}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${cls}`}
                    >
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md border border-current text-xs font-bold">
                        {opt.key}
                      </span>
                      <span>{opt.text}</span>
                    </button>
                  );
                })}
              </div>

              {submitted && answers[qi] == null && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-200">
                  Unanswered · 0 points
                </div>
              )}

              {submitted && (
                <div className="mt-4 rounded-xl border border-navy-700 bg-navy-950/60 px-4 py-3 text-sm text-slate-300">
                  <span className="font-semibold text-brand-400">
                    Why:{" "}
                  </span>
                  {q?.explanation || "No explanation was provided."}
                </div>
              )}
            </div>
          ))}
        </div>

        {showSubmitConfirmation && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-confirmation-title"
          >
            <div className="card w-full max-w-md p-6">
              <h2 id="submit-confirmation-title" className="text-lg font-bold text-white">
                Submit unanswered questions?
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                You left {unansweredCount} question
                {unansweredCount === 1 ? "" : "s"} unanswered. Submit anyway?
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirmation(false)}
                  className="rounded-lg border border-navy-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/5"
                >
                  Review Answers
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  disabled={isSubmitting}
                  className="btn-primary px-4 py-2"
                >
                  Submit Anyway
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-stretch sm:justify-end">
          {!submitted ? (
            <div className="w-full sm:w-auto">
              {submitError && (
                <p className="mb-3 text-right text-sm text-rose-300">
                  {submitError}
                </p>
              )}
              <button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="btn-primary w-full px-8 sm:w-auto disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Submit Answers"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate("/coding")}
              disabled={!sessionId}
              className="btn-primary w-full px-8 sm:w-auto"
            >
              Start Coding Assessment →
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}