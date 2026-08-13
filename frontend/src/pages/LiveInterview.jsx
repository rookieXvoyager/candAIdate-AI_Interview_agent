import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Mic, Square } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useInterview } from "../context/InterviewContext";
import { WS_BASE } from "../lib/api";
import AppShell from "../components/AppShell";

export default function LiveInterview() {
  const { getToken } = useAuth();
  const { sessionId } = useInterview();
  const navigate = useNavigate();

  const wsRef = useRef(null);
  const scrollRef = useRef(null);
  const endingRef = useRef(false);
  const recognitionRef = useRef(null); // Reference for Web Speech API

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("connecting");
  const [aiThinking, setAiThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          // Send text directly to backend (Bypassing Azure C++ Drivers)
          wsRef.current?.send(JSON.stringify({ type: "text", text: transcript }));
          setMessages((prev) => [...prev, { speaker: "Candidate", text: transcript }]);
          setAiThinking(true);
        }
      };

      recognitionRef.current.onend = () => setIsRecording(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      navigate("/dashboard", { replace: true });
      return;
    }

    let active = true;
    let socket;

    (async () => {
      try {
        const token = await getToken();
        if (!active) return;

        socket = new WebSocket(
          `${WS_BASE}/api/v1/interview/stream/${sessionId}?token=${token}`
        );
        wsRef.current = socket;
        setAiThinking(true);

        socket.onopen = () => {
          if (wsRef.current === socket) setStatus("open");
        };

        socket.onmessage = (event) => {
          if (wsRef.current !== socket) return;
          
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === "ping") {
              socket.send(JSON.stringify({ type: "pong" }));
              return;
            }

            if (parsed.type === "ai_response") {
              setAiThinking(false);
              setMessages((prev) => [...prev, { speaker: "Interviewer", text: parsed.text }]);
              
              if (parsed.audio_base64) {
                const audio = new Audio("data:audio/wav;base64," + parsed.audio_base64);
                audio.play().catch(e => console.error("Audio playback failed:", e));
              }
              return;
            }
          } catch (e) {
            console.error("WS parse error", e);
          }
        };

        socket.onclose = () => {
          if (wsRef.current === socket) setStatus(endingRef.current ? "closed" : "error");
        };
      } catch {
        if (active) setStatus("error");
      }
    })();

    return () => {
      active = false;
      if (socket) socket.close();
    };
  }, [sessionId, getToken, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, aiThinking]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text || status !== "open") return;
    wsRef.current?.send(JSON.stringify({ type: "text", text }));
    setMessages((prev) => [...prev, { speaker: "Candidate", text }]);
    setInput("");
    setAiThinking(true);
  };

  const startRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const endInterview = () => {
    endingRef.current = true;
    wsRef.current?.close(1000, "Interview ended");
    navigate("/feedback");
  };

  const statusMeta = {
    connecting: { label: "Connecting…", color: "bg-amber-400" },
    open: { label: "Live", color: "bg-emerald-400" },
    closed: { label: "Ended", color: "bg-slate-500" },
    error: { label: "Disconnected", color: "bg-rose-400" },
  }[status];

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-4xl flex-col">
        <div className="flex items-center justify-between rounded-t-2xl border border-navy-700 bg-navy-800 p-4">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-brand-400" />
            <h2 className="text-lg font-semibold text-white">AI Interviewer</h2>
            <div className="ml-4 flex items-center gap-2 rounded-full border border-navy-700 bg-navy-900 px-3 py-1 text-xs">
              <span className={`h-2 w-2 rounded-full ${statusMeta.color} ${status === "open" ? "animate-pulse" : ""}`} />
              <span className="text-slate-300">{statusMeta.label}</span>
            </div>
          </div>
          <button onClick={endInterview} className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-4 py-2 text-sm text-rose-400 transition-colors hover:bg-rose-500/20">
            <Square className="h-4 w-4" /> End & Get Feedback
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto border-x border-navy-700 bg-navy-900/50 p-5 scroll-smooth">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.speaker === "Candidate" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.speaker === "Candidate" ? "rounded-br-sm bg-brand-600 text-white" : "rounded-bl-sm border border-navy-700 bg-navy-800 text-slate-100"}`}>
                {m.text}
              </div>
            </div>
          ))}
          {aiThinking && (
            <div className="flex justify-start">
              <div className="flex gap-1.5 rounded-2xl rounded-bl-sm border border-navy-700 bg-navy-800 px-4 py-3">
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-end gap-3 rounded-b-2xl border border-navy-700 bg-navy-800 p-4">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all ${isRecording ? "animate-pulse border-rose-400 bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.5)]" : "border-navy-600 bg-navy-900 text-slate-300 hover:bg-navy-700"}`}
          >
            <Mic className="h-5 w-5" />
          </button>
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="max-h-32 flex-1 resize-none rounded-xl border border-navy-600 bg-navy-900 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none"
            placeholder="Type or hold mic to answer..."
          />
          <button onClick={sendMessage} className="flex h-12 items-center justify-center rounded-xl bg-brand-600 px-6 text-sm text-white">Send</button>
        </div>
      </div>
    </AppShell>
  );
}