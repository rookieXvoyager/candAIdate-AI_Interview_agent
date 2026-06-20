import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrainCircuit, AlertTriangle } from "lucide-react";
import { useInterview } from "../context/InterviewContext";
import { API_BASE } from "../lib/api";
import AppShell from "../components/AppShell";

// --- Loading skeleton: "Generating your AI Interview Scorecard…" ---
function SkeletonCard() {
  const Bar = ({ w }) => (
    <div className={`relative h-4 overflow-hidden rounded bg-navy-800 ${w}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600/20">
          <BrainCircuit className="h-7 w-7 text-brand-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">
          Generating your AI Interview Scorecard…
        </h1>
        <p className="mt-2 text-slate-400">
          The coaching agent is analyzing your full transcript.
        </p>
      </div>

      <div className="card mb-6 flex items-center gap-6 p-6">
        <div className="h-24 w-24 flex-none rounded-full border-4 border-navy-800" />
        <div className="flex-1 space-y-3">
          <Bar w="w-1/3" />
          <Bar w="w-2/3" />
          <Bar w="w-1/2" />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="card space-y-3 p-6">
            <Bar w="w-1/2" />
            <Bar w="w-full" />
            <Bar w="w-5/6" />
            <Bar w="w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreRing({ score }) {
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const tone =
    score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#fb7185";
  return (
    <div className="relative h-28 w-28 flex-none">
      <svg viewBox="0 0 36 36" className="h-28 w-28 -rotate-90">
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          stroke="#1a2438"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          stroke={tone}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${pct * 100} 100`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{score}</span>
        <span className="text-xs text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

function List({ title, items, tone }) {
  const dot = tone === "green" ? "bg-emerald-400" : "bg-rose-400";
  const head = tone === "green" ? "text-emerald-300" : "text-rose-300";
  return (
    <div className="card p-6">
      <h2 className={`mb-4 text-sm font-semibold uppercase tracking-wide ${head}`}>
        {title}
      </h2>
      <ul className="space-y-2.5">
        {(items || []).map((it, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-slate-300">
            <span className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${dot}`} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Feedback() {
  const { sessionId, quizScore, evaluation, setEvaluation } = useInterview();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!evaluation);
  const [error, setError] = useState("");
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (evaluation || requestedRef.current) return;
    requestedRef.current = true;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/evaluate/${sessionId}`, {
          method: "POST",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Request failed (${res.status}).`);
        }
        const json = await res.json();
        setEvaluation(json.data);
      } catch (err) {
        setError(err.message || "Could not generate your scorecard.");
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, evaluation, setEvaluation, navigate]);

  if (loading) {
    return (
      <AppShell step={5}>
        <SkeletonCard />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell step={5}>
        <div className="mx-auto max-w-lg text-center">
          <div className="card p-8">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
            <h1 className="text-xl font-bold text-white">
              Couldn't generate your scorecard
            </h1>
            <p className="mt-2 text-sm text-slate-400">{error}</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="btn-ghost mt-6"
            >
              Start over
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  const e = evaluation || {};

  return (
    <AppShell step={5}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Your Interview Scorecard
          </h1>
          <p className="mt-2 text-slate-400">
            Here's how you performed, with coaching to level up.
          </p>
        </div>

        {/* Score summary */}
        <div className="card mb-6 flex flex-wrap items-center gap-6 p-6">
          <ScoreRing score={e.score ?? 0} />
          <div className="flex-1">
            <p className="text-sm uppercase tracking-wide text-slate-400">
              Overall Performance
            </p>
            <p className="mt-1 text-2xl font-bold text-white">
              {e.score >= 75
                ? "Strong showing"
                : e.score >= 50
                ? "Solid, with room to grow"
                : "Keep practicing"}
            </p>
            {quizScore && (
              <p className="mt-2 text-sm text-slate-400">
                Pre-screen quiz:{" "}
                <span className="font-semibold text-slate-200">
                  {quizScore.correct}/{quizScore.total}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Strengths & weaknesses */}
        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <List title="Strengths" items={e.strengths} tone="green" />
          <List title="Areas to Improve" items={e.weaknesses} tone="red" />
        </div>

        {/* Detailed feedback */}
        <div className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Detailed Feedback
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">
            {e.detailed_feedback}
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <button onClick={() => navigate("/dashboard")} className="btn-ghost">
            Run another interview
          </button>
        </div>
      </div>
    </AppShell>
  );
}
