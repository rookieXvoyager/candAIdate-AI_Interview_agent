import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { Inbox } from "lucide-react";
import { db, isFirebaseConfigured } from "../firebase";
import { useAuth } from "../context/AuthContext";
import AppShell from "../components/AppShell";
import Spinner from "../components/Spinner";
import { useInterview } from "../context/InterviewContext";
import { API_BASE } from "../lib/api";

const STATUS_META = {
  pending_mcq: { label: "Assessment pending", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  pending_assessment: { label: "Assessment pending", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  pending_coding: { label: "Coding Pending", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  pending_interview: { label: "Ready for Interview", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  ready_for_evaluation: { label: "Awaiting feedback", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  in_progress: { label: "Interview in progress", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  completed: { label: "Completed", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
};

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : null;
    if (!d) return "—";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function scoreColor(score) {
  if (score == null) return "text-slate-500";
  if (score >= 75) return "text-emerald-300";
  if (score >= 50) return "text-amber-300";
  return "text-rose-300";
}

export default function History() {
  const { currentUser, getToken } = useAuth();
  const { setSessionId, setAssessment, setEvaluation, resetInterviewSession } =
    useInterview();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUser || !isFirebaseConfigured || !db) {
      setLoading(false);
      return;
    }
    let active = true;

    (async () => {
      try {
        // Filter by uid only (no orderBy) to avoid needing a composite index;
        // we sort client-side below.
        const q = query(
          collection(db, "sessions"),
          where("uid", "==", currentUser.uid)
        );
        const snap = await getDocs(q);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // For completed sessions, fetch the linked evaluation to show the score.
        await Promise.all(
          rows.map(async (r) => {
            if (r.evaluation_id) {
              try {
                const evalSnap = await getDoc(
                  doc(db, "evaluations", r.evaluation_id)
                );
                if (evalSnap.exists()) r.score = evalSnap.data().score;
              } catch {
                /* ignore individual eval read failures */
              }
            }
          })
        );

        rows.sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
        );

        if (active) setSessions(rows);
      } catch (err) {
        if (active)
          setError(
            err?.code === "permission-denied"
              ? "Can't read your history — Firestore security rules are blocking reads."
              : "Couldn't load your interview history."
          );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [currentUser]);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Interview History
            </h1>
            <p className="mt-2 text-slate-400">
              Your past sessions and scorecards.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="btn-primary"
            onClick={resetInterviewSession}
          >
            + New Interview
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-slate-400">
            <Spinner /> Loading your history…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        ) : sessions.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-16 text-center">
            <Inbox className="mb-4 h-10 w-10 text-slate-500" />
            <h2 className="text-lg font-semibold text-white">
              No interviews yet
            </h2>
            <p className="mt-2 max-w-sm text-sm text-slate-400">
              Start your first mock interview and your sessions will show up here.
            </p>
            <Link to="/dashboard" className="btn-primary mt-6">
              Start practicing
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => {
              const meta =
                STATUS_META[s.status] || {
                  label: s.status || "Unknown",
                  cls: "bg-navy-800 text-slate-300 border-navy-700",
                };
              return (
                <div
                  key={s.id}
                  className="card flex flex-wrap items-center justify-between gap-4 p-5 transition hover:border-brand-500/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {s.targetRole || "Interview session"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(s.createdAt)} · {s.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`pill border ${meta.cls}`}>{meta.label}</span>
                    {s.score != null && (
                      <div className="text-right">
                        <p
                          className={`text-2xl font-bold leading-none ${scoreColor(
                            s.score
                          )}`}
                        >
                          {s.score}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">
                          / 100
                        </p>
                      </div>
                    )}
                    {s.status === "pending_interview" && (
                      <button
                        type="button"
                        onClick={() => {
                          setSessionId(s.id);
                          navigate("/interview");
                        }}
                        className="btn-primary px-3 py-2 text-xs"
                      >
                        Continue Interview
                      </button>
                    )}
                    {s.status === "pending_coding" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSessionId(s.id);
                            navigate("/coding");
                          }}
                          className="btn-primary px-3 py-2 text-xs"
                        >
                          Continue Coding
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await updateDoc(doc(db, "sessions", s.id), {
                              status: "cancelled",
                            });
                            setSessions((current) =>
                              current.map((session) =>
                                session.id === s.id
                                  ? { ...session, status: "cancelled" }
                                  : session
                              )
                            );
                          }}
                          className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-300"
                        >
                          End Session
                        </button>
                      </div>
                    )}
                    {(s.status === "ready_for_evaluation" ||
                      s.status === "in_progress") && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setSessionId(s.id);
                            const token = await getToken();
                            const response = await fetch(
                              `${API_BASE}/api/v1/evaluate/${encodeURIComponent(s.id)}`,
                              {
                                method: "POST",
                                headers: {
                                  Authorization: `Bearer ${token}`,
                                },
                              }
                            );
                            if (!response.ok) {
                              const data = await response.json().catch(() => ({}));
                              throw new Error(
                                data.detail || "Could not generate feedback."
                              );
                            }
                            const payload = await response.json();
                            setEvaluation(payload?.data || null);
                            navigate("/feedback");
                          } catch (error) {
                            console.error("Finalize session failed:", error);
                            setSessionId(s.id);
                            navigate("/feedback");
                          }
                        }}
                        className="btn-primary px-3 py-2 text-xs"
                      >
                        Finalize &amp; View Result
                      </button>
                    )}
                    {(s.status === "pending_mcq" ||
                      s.status === "pending_assessment") && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSessionId(s.id);
                            setAssessment(s.mcq_quiz || null);
                            navigate("/quiz");
                          }}
                          className="rounded-lg border border-brand-500/40 px-3 py-2 text-xs font-semibold text-brand-300"
                        >
                          Resume Assessment
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await updateDoc(doc(db, "sessions", s.id), {
                              status: "cancelled",
                            });
                            setSessions((current) =>
                              current.map((session) =>
                                session.id === s.id
                                  ? { ...session, status: "cancelled" }
                                  : session
                              )
                            );
                          }}
                          className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-300"
                        >
                          End Session
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
