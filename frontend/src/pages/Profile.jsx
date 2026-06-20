import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useInterview } from "../context/InterviewContext";
import { API_BASE } from "../lib/api";
import AppShell from "../components/AppShell";
import Spinner from "../components/Spinner";

function Pill({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-navy-800 text-slate-200 border border-navy-700",
    green: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    red: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
  };
  return <span className={`pill ${tones[tone]}`}>{children}</span>;
}

export default function Profile() {
  const { getToken } = useAuth();
  const { profile, setAssessment, setSessionId } = useInterview();
  const navigate = useNavigate();

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Guard against a hard refresh that loses in-memory profile state.
  useEffect(() => {
    if (!profile) navigate("/dashboard", { replace: true });
  }, [profile, navigate]);

  if (!profile) return null;

  const {
    candidate_name,
    experience_level,
    primary_domain,
    core_skills = [],
    matched_competencies = [],
    missing_gap_skills = [],
  } = profile;

  const handleGenerate = async () => {
    setError("");
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/v1/setup/generate-mcq`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profile),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data.detail || `Request failed (${res.status}).`;
        if (/RESOURCE_EXHAUSTED|429|quota/i.test(detail)) {
          throw new Error(
            "The AI is rate-limited (Gemini free-tier quota reached). Wait a minute and try again, or enable billing on your Google AI project for higher limits."
          );
        }
        if (/UNAVAILABLE|503|500|overloaded|high demand/i.test(detail)) {
          throw new Error(
            "The AI is temporarily busy (Gemini is experiencing high demand). Please wait a moment and try again."
          );
        }
        throw new Error(detail);
      }

      const data = await res.json();
      setAssessment(data.assessment);
      setSessionId(data.session_id);
      navigate("/quiz");
    } catch (err) {
      setError(err.message || "Failed to generate assessment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell step={2}>
      <div className="mx-auto max-w-4xl">
        {/* Candidate header */}
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {candidate_name || "Candidate"}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Here's how your profile maps to the role.
            </p>
          </div>
          <div className="flex gap-2">
            <span className="pill border border-brand-500/30 bg-brand-600/15 text-brand-400">
              {experience_level || "—"}
            </span>
            <span className="pill border border-navy-700 bg-navy-800 text-slate-200">
              {primary_domain || "—"}
            </span>
          </div>
        </div>

        {/* Core skills */}
        <div className="card mb-6 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Core Skills
          </h2>
          <div className="flex flex-wrap gap-2">
            {core_skills.length ? (
              core_skills.map((s) => <Pill key={s}>{s}</Pill>)
            ) : (
              <p className="text-sm text-slate-500">No skills detected.</p>
            )}
          </div>
        </div>

        {/* Match vs Gap */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Matched Job Description
            </h2>
            <div className="flex flex-wrap gap-2">
              {matched_competencies.length ? (
                matched_competencies.map((s) => (
                  <Pill key={s} tone="green">
                    {s}
                  </Pill>
                ))
              ) : (
                <p className="text-sm text-slate-500">No direct matches found.</p>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-rose-300">
              <span className="h-2 w-2 rounded-full bg-rose-400" />
              Gaps vs Job Description
            </h2>
            <div className="flex flex-wrap gap-2">
              {missing_gap_skills.length ? (
                missing_gap_skills.map((s) => (
                  <Pill key={s} tone="red">
                    {s}
                  </Pill>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  No gaps — strong alignment!
                </p>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div className="mt-8 flex justify-stretch sm:justify-end">
          <button
            onClick={handleGenerate}
            disabled={busy}
            className="btn-primary w-full px-8 sm:w-auto"
          >
            {busy && <Spinner />}
            {busy ? "Generating…" : "Generate Assessment"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
