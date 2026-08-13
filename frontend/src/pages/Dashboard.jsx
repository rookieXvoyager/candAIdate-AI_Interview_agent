import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { Target, Award, Activity, ChevronRight, Inbox, Plus } from "lucide-react";
import { db, isFirebaseConfigured } from "../firebase";
import { useAuth } from "../context/AuthContext";
import AppShell from "../components/AppShell";
import Spinner from "../components/Spinner";

const STATUS_META = {
  pending_mcq: { label: "Assessment pending", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  ready_for_evaluation: { label: "Awaiting feedback", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  completed: { label: "Completed", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
};

function formatDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : null;
    if (!d) return "—";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

export default function Dashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ total: 0, average: 0, highest: 0 });
  const [recentSessions, setRecentSessions] = useState([]);

  useEffect(() => {
    if (!currentUser || !isFirebaseConfigured || !db) {
      setLoading(false);
      return;
    }
    
    let active = true;

    (async () => {
      try {
        // Fetch all user sessions
        const q = query(collection(db, "sessions"), where("uid", "==", currentUser.uid));
        const snap = await getDocs(q);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Fetch scores for completed sessions
        await Promise.all(
          rows.map(async (r) => {
            if (r.evaluation_id) {
              try {
                const evalSnap = await getDoc(doc(db, "evaluations", r.evaluation_id));
                if (evalSnap.exists()) r.score = evalSnap.data().score;
              } catch { /* ignore read failures */ }
            }
          })
        );

        // Sort by date (newest first)
        rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

        if (active) {
          const scoredSessions = rows.filter(r => r.score != null);
          const total = rows.length;
          const highest = scoredSessions.length ? Math.max(...scoredSessions.map(r => r.score)) : 0;
          const average = scoredSessions.length 
            ? Math.round(scoredSessions.reduce((acc, r) => acc + r.score, 0) / scoredSessions.length) 
            : 0;

          setMetrics({ total, average, highest });
          setRecentSessions(rows.slice(0, 3)); // Show top 3 on dashboard
        }
      } catch (err) {
        console.error("Dashboard history fetch error:", err);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [currentUser]);

  // Derive display name from email or provider
  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || "Candidate";

  return (
    <AppShell step={0}>
      <div className="mx-auto max-w-5xl">
        
        {/* --- Header --- */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Welcome back, <span className="text-brand-400">{displayName}</span>
          </h1>
          <p className="mt-2 text-slate-400">
            Track your progress and start your next AI mock interview.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          
          {/* --- Main Action Card --- */}
          <div className="card md:col-span-2 relative overflow-hidden bg-gradient-to-br from-brand-900/30 to-navy-900 p-8 border-brand-500/30">
            <div className="relative z-10">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/20">
                <Target className="h-6 w-6 text-brand-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Let's tailor your interview
              </h2>
              <p className="text-slate-300 max-w-md mb-8">
                Upload your resume and a target job description. We'll generate a custom pre-screen quiz and an adaptive live AI interviewer just for you.
              </p>
              <button 
                onClick={() => navigate("/setup")} 
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Start New Interview
              </button>
            </div>
            {/* Decorative background glow */}
            <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-brand-600/10 blur-[80px] pointer-events-none" />
          </div>

          {/* --- Quick Metrics --- */}
          <div className="flex flex-col gap-6">
            <div className="card p-6 flex-1 flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-2">
                <Activity className="h-5 w-5 text-sky-400" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Total Interviews</h3>
              </div>
              <p className="text-4xl font-bold text-white">
                {loading ? <Spinner /> : metrics.total}
              </p>
            </div>
            
            <div className="card p-6 flex-1 flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-2">
                <Award className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Avg. Score</h3>
              </div>
              <p className={`text-4xl font-bold ${scoreColor(metrics.average)}`}>
                {loading ? <Spinner /> : `${metrics.average}%`}
              </p>
            </div>
          </div>
        </div>

        {/* --- Recent History Preview --- */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent Sessions</h2>
          <Link to="/history" className="text-sm font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1">
            View all <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Spinner />
          </div>
        ) : recentSessions.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-10 text-center border-dashed border-navy-600 bg-navy-900/30">
            <Inbox className="mb-3 h-8 w-8 text-slate-500" />
            <p className="text-sm text-slate-400">No interviews completed yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentSessions.map((s) => {
              const meta = STATUS_META[s.status] || { label: s.status || "Unknown", cls: "bg-navy-800 text-slate-300 border-navy-700" };
              return (
                <div key={s.id} className="card flex flex-wrap items-center justify-between gap-4 p-4 transition hover:border-brand-500/40">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{s.targetRole || "Interview session"}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{formatDate(s.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`pill border ${meta.cls}`}>{meta.label}</span>
                    {s.score != null && (
                      <div className="text-right w-16">
                        <p className={`text-xl font-bold leading-none ${scoreColor(s.score)}`}>{s.score}</p>
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