import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, UploadCloud } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useInterview } from "../context/InterviewContext";
import { API_BASE } from "../lib/api";
import AppShell from "../components/AppShell";
import Spinner from "../components/Spinner";

const ALLOWED_EXT = [".pdf", ".docx", ".txt"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — matches backend limit

function isAllowed(file) {
  const name = file.name.toLowerCase();
  return ALLOWED_EXT.some((ext) => name.endsWith(ext));
}

export default function Upload() {
  const { getToken } = useAuth();
  const { setProfile } = useInterview();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [jdText, setJdText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const acceptFile = (f) => {
    setError("");
    if (!f) return;
    if (!isAllowed(f)) {
      setError("Only PDF, DOCX, or TXT files are supported.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File is too large. Maximum size is 5 MB.");
      return;
    }
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const handleAnalyze = async () => {
    setError("");
    if (!file) return setError("Please upload your resume first.");
    if (!jdText.trim())
      return setError("Please paste the target job description.");

    setBusy(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("resume", file);
      formData.append("jd_text", jdText);

      const res = await fetch(`${API_BASE}/api/v1/setup/parse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data.detail || `Request failed (${res.status}).`;
        // Surface Gemini rate-limits / overloads as a short, friendly message.
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
      setProfile(data.profile);
      navigate("/profile");
    } catch (err) {
      setError(err.message || "Failed to analyze. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell step={1}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Let's tailor your interview
          </h1>
          <p className="mt-2 text-slate-400">
            Upload your resume and the job description you're targeting.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Left — Resume drop zone */}
          <div className="card p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Resume
            </h2>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={[
                "flex h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition",
                dragging
                  ? "border-brand-500 bg-brand-600/10"
                  : "border-navy-700 bg-navy-950/40 hover:border-brand-500/60 hover:bg-navy-800/40",
              ].join(" ")}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={(e) => acceptFile(e.target.files?.[0])}
              />
              {file ? (
                <>
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20">
                    <FileText className="h-6 w-6 text-emerald-300" />
                  </div>
                  <p className="font-semibold text-slate-100">{file.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {(file.size / 1024).toFixed(0)} KB · click to replace
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-navy-800">
                    <UploadCloud className="h-6 w-6 text-brand-400" />
                  </div>
                  <p className="font-semibold text-slate-200">
                    Drag & drop your resume
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    or click to browse · PDF, DOCX, TXT · max 5 MB
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Right — Job description */}
          <div className="card p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Job Description
            </h2>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the full job description here…"
              className="input-field h-64 resize-none scroll-thin"
            />
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div className="mt-8 flex justify-stretch sm:justify-end">
          <button
            onClick={handleAnalyze}
            disabled={busy}
            className="btn-primary w-full px-8 sm:w-auto"
          >
            {busy && <Spinner />}
            {busy ? "Analyzing…" : "Analyze & Continue"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
