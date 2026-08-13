import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Target, BookOpen, Clock } from "lucide-react";
import { useInterview } from "../context/InterviewContext";
import AppShell from "../components/AppShell";

const QUIZ_MINUTES = 10;

export default function Quiz() {
  const { assessment, setQuizScore } = useInterview();
  const navigate = useNavigate();

  const questions = useMemo(
    () => assessment?.questions || [],
    [assessment]
  );

  const [answers, setAnswers] = useState({}); // { [index]: "A" }
  const [submitted, setSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(QUIZ_MINUTES * 60);

  // If state was lost (hard refresh), send the user back to the start.
  useEffect(() => {
    if (!assessment) navigate("/dashboard", { replace: true });
  }, [assessment, navigate]);

  // --- Countdown Timer Logic ---
  useEffect(() => {
    if (submitted || !assessment) return;
    
    if (secondsLeft <= 0) {
      handleSubmit(); // Auto-submit when time is up
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
  const allAnswered = Object.keys(answers).length === questions.length;

  const handleSelect = (qIndex, key) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qIndex]: key }));
  };

  const handleSubmit = () => {
    setSubmitted(true);
    setQuizScore({ correct: score, total: questions.length });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
              : `Answer all ${questions.length} questions to continue.`}
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
                {score}
                <span className="text-lg text-slate-500">
                  {" "}
                  / {questions.length}
                </span>
              </p>
            </div>
            <div className="text-right">
              {score / questions.length >= 0.6 ? (
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
                {q.options.map((opt) => {
                  const selected = answers[qi] === opt.key;
                  const isCorrect = opt.key === q.correct_answer;
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

              {submitted && (
                <div className="mt-4 rounded-xl border border-navy-700 bg-navy-950/60 px-4 py-3 text-sm text-slate-300">
                  <span className="font-semibold text-brand-400">
                    Why:{" "}
                  </span>
                  {q.explanation}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-stretch sm:justify-end">
          {!submitted ? (
            <button
              onClick={handleSubmit}
              disabled={!allAnswered}
              className="btn-primary w-full px-8 sm:w-auto disabled:opacity-50"
            >
              Submit Answers
            </button>
          ) : (
            <button
              onClick={() => navigate("/coding")}
              className="btn-primary w-full px-8 sm:w-auto"
            >
              Proceed to Coding Assessment →
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}