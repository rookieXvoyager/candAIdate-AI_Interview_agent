import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrainCircuit, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
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
  const safeScore = Number.isFinite(Number(score)) ? Number(score) : 0;
  const pct = Math.max(0, Math.min(100, safeScore)) / 100;
  const tone =
    safeScore >= 75 ? "#34d399" : safeScore >= 50 ? "#fbbf24" : "#fb7185";
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
        <span className="text-2xl font-bold text-white">{safeScore}</span>
        <span className="text-xs text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

function ScoreContributionDisc({ overallScore, breakdown }) {
  const safeOverall = Number.isFinite(Number(overallScore))
    ? Math.max(0, Math.min(100, Number(overallScore)))
    : 0;
  const normalizedBreakdown =
    breakdown && typeof breakdown === "object" ? breakdown : {};
  const colors = {
    mcq: "#38bdf8",
    coding: "#8b5cf6",
    interview: "#34d399",
  };
  const labels = {
    mcq: "MCQs",
    coding: "Coding",
    interview: "Live Interview",
  };
  const chartData = ["mcq", "coding", "interview"].map((key) => {
    const item = normalizedBreakdown[key];
    return {
      name: labels[key],
      value: item
        ? Math.max(0, Number(item.weighted_contribution) || 0)
        : 0,
      key,
    };
  });
  chartData.push({
    name: "Unscored / Remaining",
    value: Math.max(0, 100 - safeOverall),
    key: "remaining",
  });

  return (
    <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)] md:items-center">
      <div className="relative mx-auto h-64 w-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={72}
              outerRadius={112}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              paddingAngle={1}
            >
              {chartData.map((item) => (
                <Cell
                  key={item.key}
                  fill={
                    item.key === "remaining"
                      ? "#1e293b"
                      : colors[item.key]
                  }
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${value} pts`, name]}
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "0.75rem",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-white">{safeOverall}</span>
          <span className="text-xs uppercase tracking-wide text-slate-500">
            / 100
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {["mcq", "coding", "interview"].map((key) => {
          const item = normalizedBreakdown[key];
          if (!item) return null;
          const raw = Math.max(0, Number(item.raw_score) || 0);
          const weight = Math.max(0, Number(item.weight_percent) || 0);
          const contribution = Math.max(
            0,
            Number(item.weighted_contribution) || 0
          );
          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-xl border border-navy-700 bg-navy-950/40 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: colors[key] }}
                />
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    {item.label || labels[key]}
                  </p>
                  <p className="text-xs text-slate-500">
                    {raw}% × {weight}% = +{contribution} pts
                  </p>
                </div>
              </div>
              <span className="text-lg font-bold text-white">
                +{contribution}
              </span>
            </div>
          );
        })}
        {!normalizedBreakdown.mcq &&
          !normalizedBreakdown.coding &&
          !normalizedBreakdown.interview && (
            <p className="text-sm text-slate-400">
              Section contribution details are unavailable for this legacy
              session.
            </p>
          )}
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
        {(Array.isArray(items) ? items : []).map((it, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-slate-300">
            <span className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${dot}`} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedbackList({ title, items, tone = "green" }) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return null;
  return (
    <div>
      <h3
        className={`mb-2 text-xs font-semibold uppercase tracking-wide ${
          tone === "green" ? "text-emerald-300" : "text-rose-300"
        }`}
      >
        {title}
      </h3>
      <ul className="space-y-2">
        {safeItems.map((item, index) => (
          <li
            key={`${title}-${index}`}
            className="flex gap-2 text-sm leading-relaxed text-slate-300"
          >
            <span
              className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${
                tone === "green" ? "bg-emerald-400" : "bg-rose-400"
              }`}
            />
            {typeof item === "string" ? item : "See detailed feedback"}
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
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="btn-primary"
              >
                Retry Generating Feedback
              </button>
              <button
                onClick={() => navigate("/dashboard")}
                className="btn-ghost"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const e = evaluation && typeof evaluation === "object" ? evaluation : {};
  const normalizedScore = Number.isFinite(Number(e.overall_score ?? e.score))
    ? Number(e.overall_score ?? e.score)
    : 0;
  const strengths = Array.isArray(e.strengths) ? e.strengths : [];
  const weaknesses = Array.isArray(e.weaknesses) ? e.weaknesses : [];
  const detailedFeedback =
    typeof e.detailed_feedback === "string"
      ? e.detailed_feedback
      : "No detailed feedback was generated.";
  const scoreBreakdown =
    e.score_breakdown && typeof e.score_breakdown === "object"
      ? e.score_breakdown
      : {};
  const sectionFeedback =
    e.section_feedback && typeof e.section_feedback === "object"
      ? e.section_feedback
      : {};
  const overallFeedback =
    e.overall_feedback && typeof e.overall_feedback === "object"
      ? e.overall_feedback
      : {};

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

        <div className="card mb-8 p-6">
          <ScoreContributionDisc
            overallScore={normalizedScore}
            breakdown={scoreBreakdown}
          />
        </div>

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-bold text-white">
            Section-Wise Feedback
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { key: "mcq", label: "MCQs", tone: "sky" },
              { key: "coding", label: "Coding", tone: "violet" },
              { key: "interview", label: "Live Interview", tone: "emerald" },
            ].map(({ key, label, tone }) => {
              const feedback = sectionFeedback[key];
              if (key === "coding" && !scoreBreakdown.coding && !feedback) {
                return null;
              }
              const sectionScore =
                feedback && Number.isFinite(Number(feedback.score))
                  ? Math.max(0, Math.min(100, Number(feedback.score)))
                  : key === "mcq"
                    ? Number(scoreBreakdown.mcq?.raw_score || 0)
                    : key === "coding"
                      ? Number(scoreBreakdown.coding?.raw_score || 0)
                      : 0;
              const badgeColor =
                tone === "sky"
                  ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
                  : tone === "violet"
                    ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
              return (
                <div key={key} className="card p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-white">{label}</h3>
                    <span className={`pill border ${badgeColor}`}>
                      {sectionScore}/100
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-300">
                    {typeof feedback?.summary === "string"
                      ? feedback.summary
                      : key === "mcq"
                        ? "MCQ performance summary unavailable for this legacy session."
                        : key === "coding"
                          ? "Coding performance summary unavailable for this legacy session."
                          : "Live interview performance summary unavailable for this legacy session."}
                  </p>
                  <div className="mt-4 space-y-3">
                    <FeedbackList
                      title="Strengths"
                      items={
                        Array.isArray(feedback?.strengths)
                          ? feedback.strengths
                          : []
                      }
                      tone="green"
                    />
                    <FeedbackList
                      title="Improvements"
                      items={
                        Array.isArray(feedback?.improvements)
                          ? feedback.improvements
                          : []
                      }
                      tone="rose"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-white">
              Final Overall Feedback
            </h2>
            <span className="pill border border-brand-500/30 bg-brand-500/10 text-brand-300">
              {typeof overallFeedback.verdict === "string"
                ? overallFeedback.verdict
                : normalizedScore >= 75
                  ? "Strong readiness"
                  : "Needs more practice"}
            </span>
          </div>
          <p className="mb-5 whitespace-pre-line text-sm leading-relaxed text-slate-300">
            {typeof overallFeedback.executive_summary === "string"
              ? overallFeedback.executive_summary
              : detailedFeedback}
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            <FeedbackList
              title="Key Strengths"
              items={
                Array.isArray(overallFeedback.key_strengths)
                  ? overallFeedback.key_strengths
                  : strengths
              }
              tone="green"
            />
            <FeedbackList
              title="Priority Improvements"
              items={
                Array.isArray(overallFeedback.priority_improvements)
                  ? overallFeedback.priority_improvements
                  : weaknesses
              }
              tone="rose"
            />
            <FeedbackList
              title="Recommended Next Steps"
              items={
                Array.isArray(overallFeedback.next_steps)
                  ? overallFeedback.next_steps
                  : []
              }
              tone="green"
            />
          </div>
        </section>

        <div className="mt-8 flex justify-center">
          <button onClick={() => navigate("/dashboard")} className="btn-ghost">
            Run another interview
          </button>
        </div>
      </div>
    </AppShell>
  );
}
