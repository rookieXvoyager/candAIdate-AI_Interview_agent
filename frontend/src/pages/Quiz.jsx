import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Target, BookOpen } from "lucide-react";
import { useInterview } from "../context/InterviewContext";
import AppShell from "../components/AppShell";

export default function Quiz() {
  const { assessment, setQuizScore } = useInterview();
  const navigate = useNavigate();

  const questions = useMemo(
    () => assessment?.questions || [],
    [assessment]
  );

  const [answers, setAnswers] = useState({}); // { [index]: "A" }
  const [submitted, setSubmitted] = useState(false);

  // If state was lost (hard refresh), send the user back to the start.
  useEffect(() => {
    if (!assessment) navigate("/dashboard", { replace: true });
  }, [assessment, navigate]);

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

  return (
    <AppShell step={3}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Pre-screen Assessment
          </h1>
          <p className="mt-2 text-slate-400">
            {submitted
              ? "Review your answers below, then start the live interview."
              : `Answer all ${questions.length} questions to continue.`}
          </p>
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
              className="btn-primary w-full px-8 sm:w-auto"
            >
              Submit Answers
            </button>
          ) : (
            <button
              onClick={() => navigate("/interview")}
              className="btn-primary w-full px-8 sm:w-auto"
            >
              Start Live Interview →
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
