import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, AlertTriangle, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { isFirebaseConfigured } from "../firebase";
import Spinner from "../components/Spinner";
import { LogoMark } from "../components/Logo";

// Maps raw Firebase error codes to friendly copy.
function friendlyError(code) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/api-key-not-valid":
    case "auth/invalid-api-key":
      return "Firebase isn't configured. Paste your real keys into frontend/.env and restart the dev server.";
    case "auth/configuration-not-found":
    case "auth/operation-not-allowed":
      return "Email/Password sign-in isn't enabled. Turn it on in Firebase Console → Authentication → Sign-in method → Email/Password.";
    case "auth/network-request-failed":
      return "Network error reaching Firebase. Check your connection.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export default function Login() {
  const { currentUser, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  // If already signed in, skip the login screen.
  useEffect(() => {
    if (currentUser) navigate("/dashboard", { replace: true });
  }, [currentUser, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isSignup) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      navigate("/dashboard");
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-navy-950">
      {/* --- Ambient background --- */}
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="pointer-events-none absolute -left-32 top-[-10%] h-[34rem] w-[34rem] animate-drift rounded-full bg-brand-600/25 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-15%] right-[-10%] h-[32rem] w-[32rem] animate-drift rounded-full bg-sky-500/20 blur-[120px] [animation-delay:-7s]" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[100px]" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-2 lg:gap-16 lg:px-8">
        {/* --- Left: brand / value panel (desktop) --- */}
        <div className="hidden animate-fade-in flex-col justify-center lg:flex">
          <div className="flex items-center gap-3">
            <LogoMark className="h-16 w-16" />
            <span className="text-4xl font-bold tracking-tight text-white xl:text-5xl">
              cand
              <span className="text-sky-400 [text-shadow:0_0_18px_rgba(95,189,240,0.45)]">
                AI
              </span>
              date
            </span>
          </div>

          <h1 className="mt-8 text-2xl font-extrabold leading-[1.2] tracking-tight text-white xl:text-3xl">
            Walk in
            <br />
            <span className="bg-gradient-to-r from-brand-400 to-sky-400 bg-clip-text text-transparent">
              already prepared.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-slate-400">
            A personalized mock interview built from your resume and the role you
            want — screening quiz, live AI interviewer, and a coaching scorecard.
          </p>

          <ul className="mt-10 space-y-4">
            {[
              "Tailored to your resume & target job",
              "Real-time adaptive interview",
              "Objective feedback with a clear score",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-slate-300">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* --- Right: glass auth card --- */}
        <div className="flex animate-fade-in justify-center lg:justify-end">
          <div className="glass w-full max-w-md rounded-3xl p-7 sm:p-9">
            {/* Mobile brand */}
            <div className="mb-7 flex flex-col items-center text-center lg:hidden">
              <LogoMark className="mb-3 h-14 w-14" />
              <span className="text-xl font-bold tracking-tight text-white">
                cand
                <span className="text-sky-400 [text-shadow:0_0_18px_rgba(95,189,240,0.45)]">
                  AI
                </span>
                date
              </span>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-white">
                {isSignup ? "Create your account" : "Welcome back"}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {isSignup
                  ? "Start practicing in under a minute."
                  : "Sign in to continue your prep."}
              </p>
            </div>

            {!isFirebaseConfigured && (
              <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Firebase not configured
                </p>
                <p className="mt-1 text-amber-200/80">
                  Paste your web app keys into{" "}
                  <code className="rounded bg-black/40 px-1 py-0.5 text-amber-100">
                    frontend/.env
                  </code>{" "}
                  and restart the dev server.
                </p>
              </div>
            )}

            {/* Mode toggle */}
            <div className="mb-6 flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError("");
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  !isSignup
                    ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  isSignup
                    ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input-glass"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-glass"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !isFirebaseConfigured}
                className="btn-primary w-full"
              >
                {busy && <Spinner />}
                {isSignup ? "Create Account" : "Sign In"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              {isSignup ? "Already have an account?" : "New here?"}{" "}
              <button
                type="button"
                onClick={() => setMode(isSignup ? "signin" : "signup")}
                className="font-semibold text-brand-400 hover:text-brand-300"
              >
                {isSignup ? "Sign in" : "Create one"}
              </button>
            </p>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <Lock className="h-3.5 w-3.5" /> Secured with Firebase Authentication
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
