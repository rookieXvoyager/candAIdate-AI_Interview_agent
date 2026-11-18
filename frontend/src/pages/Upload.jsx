import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, UploadCloud, Wand2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useInterview } from "../context/InterviewContext";
import { API_BASE } from "../lib/api";
import AppShell from "../components/AppShell";
import Spinner from "../components/Spinner";

const ALLOWED_EXT = [".pdf", ".docx", ".txt"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const PRESET_ROLES = [
  "Software Development Engineer",  
  "Frontend Developer",
  "Backend Engineer",
  "Data Scientist",
  "DevOps Engineer",
  "Product Manager",
  "Full Stack Developer",
  "UX/UI Designer",
  "Mobile App Developer",
  "QA Engineer",
  "Cloud Solutions Architect"
];

const EXPERIENCE_LEVELS = [
  "Entry-Level",
  "Mid-Level",
  "Senior",
  "Lead / Manager"
];

function isAllowed(file) {
  const name = file.name.toLowerCase();
  return ALLOWED_EXT.some((ext) => name.endsWith(ext));
}

export default function Upload() {
  const { getToken } = useAuth();
  const { setProfile, resetInterviewSession } = useInterview();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [jobTitle, setJobTitle] = useState("");
  const [experience, setExperience] = useState("Mid-Level"); // Default experience
  const [jdText, setJdText] = useState("");
  
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [generatingJd, setGeneratingJd] = useState(false);

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

  const handleGenerateJd = async () => {
    if (!jobTitle.trim()) {
      return setError("Please enter or select a job title to generate a description.");
    }
    setError("");
    setGeneratingJd(true);
    try {
      const token = await getToken();
      
      const res = await fetch(
        `${API_BASE}/api/v1/setup/sample-jd?role=${encodeURIComponent(jobTitle)}&experience=${encodeURIComponent(experience)}`, 
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Failed to generate job description (${res.status}).`);
      }
      
      const data = await res.json();
      setJdText(data.jd_text);
    } catch (err) {
      console.error("JD Generation Error:", err);
      setError(err.message || "Failed to connect to the backend. Is FastAPI running?");
    } finally {
      setGeneratingJd(false);
    }
  };

  const handleAnalyze = async () => {
    setError("");
    resetInterviewSession();
    if (!file) return setError("Please upload your resume first.");
    if (!jdText.trim()) return setError("Please paste or generate a target job description.");

    setBusy(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("resume", file);
      formData.append("jd_text", jdText);
      if (jobTitle) formData.append("target_role", `${experience} ${jobTitle}`);

      const res = await fetch(`${API_BASE}/api/v1/setup/parse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data.detail || `Request failed (${res.status}).`;
        if (/RESOURCE_EXHAUSTED|429|quota/i.test(detail)) {
          throw new Error("The AI is rate-limited. Wait a minute and try again.");
        }
        if (/UNAVAILABLE|503|500|overloaded|high demand/i.test(detail)) {
          throw new Error("The AI is temporarily busy. Please wait a moment and try again.");
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
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Let's tailor your interview
          </h1>
          <p className="mt-2 text-slate-400">
            Upload your resume and the role you're targeting.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Left — Resume drop zone */}
          <div className="card p-6 flex flex-col">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              1. Your Resume
            </h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={[
                "flex flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition min-h-[16rem]",
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
                  <p className="font-semibold text-slate-200">Drag & drop your resume</p>
                  <p className="mt-1 text-xs text-slate-500">or click to browse · PDF, DOCX, TXT</p>
                </>
              )}
            </div>
          </div>

          {/* Right — Job Title, Experience & JD */}
          <div className="card p-6 flex flex-col">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              2. Target Role
            </h2>
            
            {/* Title Input & Presets */}
            <div className="mb-4">
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Software Engineer"
                className="input-glass w-full mb-3 rounded-lg border border-navy-600 bg-navy-900 px-4 py-2.5 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                {PRESET_ROLES.map((role) => (
                  <button
                    key={role}
                    onClick={() => setJobTitle(role)}
                    className="pill text-xs py-1 hover:bg-brand-600/20 hover:text-brand-300 hover:border-brand-500/40 transition cursor-pointer bg-navy-800 text-slate-300 border-navy-700"
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience Level */}
            <div className="mb-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Experience Level
              </label>
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_LEVELS.map((level) => (
                  <button
                    key={level}
                    onClick={() => setExperience(level)}
                    className={`pill text-xs py-1 transition cursor-pointer ${
                      experience === level 
                        ? "bg-brand-600 text-white border-brand-500 shadow-md shadow-brand-500/20" 
                        : "bg-navy-900 text-slate-400 border-navy-700 hover:border-navy-500"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* JD Textarea with Header Action */}
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Job Description
                </label>
                <button 
                  onClick={handleGenerateJd}
                  disabled={generatingJd || !jobTitle.trim()}
                  className="flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:text-brand-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {generatingJd ? <Spinner className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />}
                  {generatingJd ? "Generating..." : "Auto-Generate"}
                </button>
              </div>
              <textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                placeholder="Paste the job description here, or enter a title and click Auto-Generate..."
                className="input-glass flex-1 w-full rounded-lg border border-navy-600 bg-navy-900 px-4 py-3 text-sm text-slate-100 resize-none scroll-thin min-h-[8rem] focus:border-brand-500 focus:outline-none placeholder:text-slate-500"
              />
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
            onClick={handleAnalyze}
            disabled={busy || !file || !jdText.trim()}
            className="btn-primary w-full px-8 sm:w-auto disabled:opacity-50"
          >
            {busy && <Spinner className="h-4 w-4" />}
            {busy ? "Analyzing…" : "Analyze & Continue"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}