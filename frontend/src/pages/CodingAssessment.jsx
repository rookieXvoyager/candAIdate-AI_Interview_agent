import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
import {
  Play, CheckCircle, Terminal, ChevronRight,
  AlertCircle, Code2, Send, AlertTriangle,
} from "lucide-react";
import AppShell from "../components/AppShell";
import Spinner from "../components/Spinner";
import { useInterview } from "../context/InterviewContext";
import { API_BASE } from "../lib/api";

export default function CodingAssessment() {
  const navigate = useNavigate();
  const { sessionId, setCodingResult } = useInterview();

  const [questions,        setQuestions]        = useState([]);
  const [isLoading,        setIsLoading]        = useState(true);
  const [error,            setError]            = useState(null);

  const [activeQ,          setActiveQ]          = useState(0);
  const [language,         setLanguage]         = useState("java");
  const [theme,            setTheme]            = useState("vs-dark");
  const [codeAnswers,      setCodeAnswers]       = useState({});

  const [consoleTab,       setConsoleTab]       = useState("testcases");
  const [customInput,      setCustomInput]      = useState("");
  const [executionResult,  setExecutionResult]  = useState(null);

  const [isExecuting,      setIsExecuting]      = useState(false);
  const [isSubmitting,     setIsSubmitting]     = useState(false);
  const [evaluationModal,  setEvaluationModal]  = useState(null);

  // ------------------------------------------------------------------
  // Fetch questions on mount
  // ------------------------------------------------------------------
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        if (sessionId) {
          const sessionResponse = await fetch(
            `${API_BASE}/api/v1/coding/session/${encodeURIComponent(sessionId)}`
          );
          if (!sessionResponse.ok) {
            throw new Error("Failed to restore the coding session.");
          }
          const sessionData = await sessionResponse.json();
          if (sessionData.status === "pending_interview") {
            navigate("/interview");
            return;
          }
        }

        const response = await fetch(`${API_BASE}/api/v1/coding/questions`);
        if (!response.ok) throw new Error("Failed to load questions from database.");
        const data = await response.json();
        setQuestions(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuestions();
  }, [navigate, sessionId]);

  const currentQ = questions[activeQ];

  // Pre-populate starter code when question / language changes
  useEffect(() => {
    if (currentQ && !codeAnswers[`${activeQ}-${language}`]) {
      const starter = currentQ.starter_code?.[language] || "// Write your code here";
      setCodeAnswers(prev => ({ ...prev, [`${activeQ}-${language}`]: starter }));
    }
  }, [activeQ, language, currentQ]);

  // ------------------------------------------------------------------
  // Run Code
  // ------------------------------------------------------------------
  const handleRunCode = async () => {
    setIsExecuting(true);
    setConsoleTab("output");
    setExecutionResult(null);

    // Smart input selection: prefer custom input, then first visible test case
    let inputToUse = "";
    if (customInput && customInput.trim() !== "") {
      inputToUse = customInput;
    } else if (currentQ?.visible_test_cases?.length > 0) {
      inputToUse = currentQ.visible_test_cases[0].input;
    }

    const payload = {
      code:         codeAnswers[`${activeQ}-${language}`] || "",
      language,
      question_id:  currentQ.id,
      custom_input: inputToUse,
    };

    try {
      const response = await fetch(`${API_BASE}/api/v1/coding/execute`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await response.json();
      setExecutionResult(data);
    } catch {
      setExecutionResult({ status: "error", message: "Network Error: Execution engine unreachable." });
    } finally {
      setIsExecuting(false);
    }
  };

  // ------------------------------------------------------------------
  // Submit Solution
  // ------------------------------------------------------------------
  const handleSubmitSolution = async () => {
    setIsSubmitting(true);

    const payload = {
      code:        codeAnswers[`${activeQ}-${language}`] || "",
      language,
      question_id: currentQ.id,
      session_id:  sessionId,
    };

    try {
      const response = await fetch(`${API_BASE}/api/v1/coding/submit`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await response.json();

      if (data.status === "success") {
        setCodingResult({
          passed: data.passed,
          total: data.total,
          warning: data.warning || null,
          session_id: sessionId,
        });
        setEvaluationModal({
          passed:  data.passed,
          total:   data.total,
          warning: data.warning || null,   // infra warning from backend
        });
      } else {
        alert("Evaluation failed: " + data.message);
      }
    } catch {
      alert("Network Error: Could not evaluate hidden test cases.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipCoding = async () => {
    if (!sessionId) {
      navigate("/interview");
      return;
    }

    try {
      await fetch(`${API_BASE}/api/v1/coding/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } finally {
      setCodingResult({
        skipped: true,
        passed: 0,
        total: 0,
        session_id: sessionId,
      });
      navigate("/interview");
    }
  };

  // ------------------------------------------------------------------
  // Loading / error states
  // ------------------------------------------------------------------
  if (isLoading) {
    return (
      <AppShell step={4}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4">
          <Spinner className="h-8 w-8 text-brand-400" />
          <p className="text-slate-400 font-medium tracking-wide">Initializing Sandboxed Environment...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !currentQ) {
    return (
      <AppShell step={4}>
        <div className="card flex flex-col items-center p-10 text-center mx-auto max-w-lg mt-10">
          <AlertCircle className="mb-4 h-10 w-10 text-rose-500" />
          <h2 className="text-xl font-bold text-white mb-2">Failed to load coding assessment</h2>
          <p className="text-slate-400">{error || "No questions available."}</p>
        </div>
      </AppShell>
    );
  }

  // ------------------------------------------------------------------
  // Main render
  // ------------------------------------------------------------------
  return (
    <AppShell step={4}>

      {/* ── Evaluation Modal ── */}
      {evaluationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-navy-900 border border-white/10 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
            <CheckCircle className="h-16 w-16 text-emerald-400 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-white mb-2">Submission Results</h3>
            <div className="text-6xl font-black text-brand-400 mb-2">
              {evaluationModal.passed}{" "}
              <span className="text-3xl text-slate-500">/ {evaluationModal.total}</span>
            </div>
            <p className="text-slate-300 mb-4">Hidden test cases evaluated successfully.</p>

            {/* Infra warning — shown when some cases were skipped due to Docker issues */}
            {evaluationModal.warning && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs text-amber-300 mb-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{evaluationModal.warning}</span>
              </div>
            )}

            <button
              onClick={() => {
                setEvaluationModal(null);
                navigate("/interview");
              }}
              className="btn-primary w-full py-3"
            >
              Continue to Live Interview
            </button>
          </div>
        </div>
      )}

      {/* ── Main Layout ── */}
      <div className="mx-auto flex h-[calc(100vh-7rem)] min-h-[700px] max-w-7xl flex-col gap-4 lg:flex-row">

        {/* ── Question Number Sidebar ── */}
        <div className="card flex w-full flex-row items-center justify-between p-4 lg:w-14 lg:flex-col lg:justify-start lg:gap-4 lg:py-6">
          <div className="flex lg:flex-col gap-3">
            {questions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveQ(idx)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition shadow-inner ${
                  activeQ === idx
                    ? "bg-gradient-to-br from-brand-500 to-sky-500 text-white ring-2 ring-brand-500/30"
                    : "bg-white/[0.04] text-slate-400 hover:bg-white/10 hover:text-white border border-white/10"
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>

        {/* ── Problem Description Panel (wider: was lg:w-1/3, now lg:w-2/5) ── */}
        <div className="card flex w-full flex-col p-6 overflow-y-auto scroll-thin lg:w-2/5">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/20">
              <Code2 className="h-5 w-5 text-brand-400" />
            </div>
            <h2 className="text-xl font-bold text-white leading-tight">{currentQ.title}</h2>
          </div>

          <div className="prose prose-invert text-sm mb-8 text-slate-300 whitespace-pre-wrap leading-relaxed">
            {currentQ.description}
          </div>

          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
            Sample Cases
          </h3>
          <div className="space-y-3">
            {currentQ.visible_test_cases?.map((tc, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-white/10 bg-black/20 p-4 font-mono text-xs"
              >
                <div className="mb-2">
                  <span className="font-bold text-sky-400 mr-2">Input:</span>
                  <span className="text-slate-300">{tc.input}</span>
                </div>
                <div>
                  <span className="font-bold text-emerald-400 mr-2">Output:</span>
                  <span className="text-slate-300">{tc.expected_output}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Editor + Console Panel ── */}
        <div className="card flex flex-1 flex-col overflow-hidden min-w-0">

          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-5 py-3 gap-3 flex-wrap">
            <div className="flex gap-3">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded-xl border border-white/10 bg-navy-900 px-3 py-1.5 text-sm text-slate-200 outline-none hover:border-white/20 focus:border-brand-500 transition cursor-pointer"
              >
                <option value="java">Java</option>
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
                <option value="cpp">C++</option>
                <option value="rust">Rust</option>
              </select>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="hidden sm:block rounded-xl border border-white/10 bg-navy-900 px-3 py-1.5 text-sm text-slate-200 outline-none hover:border-white/20 focus:border-brand-500 transition cursor-pointer"
              >
                <option value="vs-dark">Dark Theme</option>
                <option value="vs">Light Theme</option>
                <option value="hc-black">High Contrast</option>
              </select>
            </div>

            <button
              onClick={() => navigate("/interview")}
              className="btn-ghost py-1.5 px-4 text-sm flex items-center gap-1 border-white/10 text-slate-300 hover:bg-white/5 transition"
            >
              Finish & Proceed <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Monaco Editor */}
          <div className={`flex-1 relative min-h-0 ${theme === "vs" ? "bg-white" : "bg-[#1e1e1e]"}`}>
            <div className="absolute inset-0">
              <Editor
                height="100%"
                width="100%"
                theme={theme}
                language={language === "cpp" ? "cpp" : language}
                value={codeAnswers[`${activeQ}-${language}`]}
                onChange={(val) =>
                  setCodeAnswers(prev => ({ ...prev, [`${activeQ}-${language}`]: val }))
                }
                options={{
                  minimap:             { enabled: false },
                  fontSize:            14,
                  padding:             { top: 16 },
                  scrollBeyondLastLine: false,
                  automaticLayout:     true,
                }}
              />
            </div>
          </div>

          {/* Console */}
          <div className="flex h-[16rem] flex-col border-t border-white/10 bg-navy-950/50 backdrop-blur-md">

            {/* Console tab bar + action buttons */}
            <div className="flex items-center gap-1 border-b border-white/10 bg-white/[0.02] px-3 pt-2 flex-wrap">
              {[
                { key: "testcases", label: "Test Cases" },
                { key: "custom",    label: "Custom Input" },
                { key: "output",    label: "Output" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setConsoleTab(key)}
                  className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
                    consoleTab === key
                      ? "bg-white/5 text-brand-400 shadow-[inset_0_-2px_0_rgba(99,102,241,1)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}

              <div className="ml-auto flex items-center gap-2 mb-1">
                <button
                  onClick={handleRunCode}
                  disabled={isExecuting}
                  className="btn-ghost border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 py-1.5 px-4 text-sm rounded-lg transition flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isExecuting ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isExecuting ? "Running..." : "Run Code"}
                </button>

                <button
                   type="button"
                   onClick={handleSkipCoding}
                   className="btn-ghost border-navy-600 px-4 py-1.5 text-sm"
                >
                   Skip Coding
                </button>

                <button
                  onClick={handleSubmitSolution}
                  disabled={isSubmitting}
                  className="btn-primary py-1.5 px-4 text-sm shadow-none flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition disabled:opacity-60"
                >
                  {isSubmitting ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />}
                  {isSubmitting ? "Evaluating..." : "Submit Solution"}
                </button>
              </div>
            </div>

            {/* Console content */}
            <div className="flex-1 overflow-y-auto scroll-thin p-4 font-mono text-sm">

              {/* Test Cases tab */}
              {consoleTab === "testcases" && (
                <div className="space-y-2">
                  {currentQ.visible_test_cases?.map((tc, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-xs"
                    >
                      <span className="text-slate-300">
                        <span className="text-slate-500 mr-2">Case {idx + 1}:</span>
                        {tc.input}
                      </span>
                      <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                        {tc.expected_output}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Custom Input tab */}
              {consoleTab === "custom" && (
                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Enter space-separated inputs here (e.g., 'anagram nagaram')..."
                  className="input-field h-full w-full resize-none font-mono text-xs p-2 bg-transparent border border-white/10 rounded focus:border-brand-500 outline-none text-slate-300"
                />
              )}

              {/* Output tab */}
              {consoleTab === "output" && (
                <div>
                  {!executionResult ? (
                    <div className="text-slate-500 flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Click "Run Code" to test your solution.
                    </div>
                  ) : executionResult.status === "error" ? (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300 text-xs whitespace-pre-wrap font-mono">
                      {executionResult.message}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                        <CheckCircle className="h-4 w-4" /> Execution completed
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-slate-300 whitespace-pre-wrap font-mono">
                        {executionResult.output}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}