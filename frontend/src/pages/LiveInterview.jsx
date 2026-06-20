import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot } from "lucide-react";
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
  const endingRef = useRef(false); // distinguishes intentional close from drops

  const [messages, setMessages] = useState([]); // { speaker, text }
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("connecting"); // connecting | open | closed | error
  const [aiThinking, setAiThinking] = useState(false);

  // --- Open the secure WebSocket once we have a session + token ---
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

        // Browsers can't set WS headers, so the Firebase JWT rides as a query param.
        socket = new WebSocket(
          `${WS_BASE}/api/v1/interview/stream/${sessionId}?token=${token}`
        );
        wsRef.current = socket;
        setAiThinking(true);

        socket.onopen = () => setStatus("open");

        socket.onmessage = (event) => {
          // Heartbeat: reply with pong and do NOT render it.
          try {
            const parsed = JSON.parse(event.data);
            if (parsed?.type === "ping") {
              socket.send(JSON.stringify({ type: "pong" }));
              return;
            }
          } catch {
            // Not JSON → it's a real interviewer message (plain text).
          }
          setAiThinking(false);
          setMessages((prev) => [
            ...prev,
            { speaker: "Interviewer", text: event.data },
          ]);
        };

        socket.onerror = () => setStatus("error");

        socket.onclose = () => {
          setStatus(endingRef.current ? "closed" : "error");
        };
      } catch {
        if (active) setStatus("error");
      }
    })();

    return () => {
      active = false;
      endingRef.current = true;
      socket?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, aiThinking]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text || status !== "open") return;
    wsRef.current?.send(text);
    setMessages((prev) => [...prev, { speaker: "Candidate", text }]);
    setInput("");
    setAiThinking(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const endInterview = () => {
    endingRef.current = true;
    wsRef.current?.close(1000, "Interview ended by candidate");
    navigate("/feedback");
  };

  const statusMeta = {
    connecting: { label: "Connecting…", color: "bg-amber-400" },
    open: { label: "Live", color: "bg-emerald-400" },
    closed: { label: "Ended", color: "bg-slate-500" },
    error: { label: "Disconnected", color: "bg-rose-400" },
  }[status];

  return (
    <AppShell step={4}>
      <div className="mx-auto flex h-[calc(100dvh-16rem)] max-w-3xl flex-col sm:h-[calc(100dvh-13rem)]">
        {/* Header */}
        <div className="card mb-4 flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600/20">
              <Bot className="h-5 w-5 text-brand-400" />
            </div>
            <div>
              <p className="font-semibold text-white">AI Interviewer</p>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span
                  className={`h-2 w-2 rounded-full ${statusMeta.color} ${
                    status === "open" ? "animate-pulse" : ""
                  }`}
                />
                {statusMeta.label}
              </div>
            </div>
          </div>
          <button
            onClick={endInterview}
            className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20"
          >
            End & Get Feedback
          </button>
        </div>

        {/* Chat window */}
        <div
          ref={scrollRef}
          className="card scroll-thin flex-1 space-y-4 overflow-y-auto p-5"
        >
          {messages.length === 0 && status === "open" && !aiThinking && (
            <p className="mt-10 text-center text-sm text-slate-500">
              Waiting for the interviewer to begin…
            </p>
          )}

          {messages.map((m, i) => {
            const mine = m.speaker === "Candidate";
            return (
              <div
                key={i}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={[
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    mine
                      ? "rounded-br-sm bg-brand-600 text-white"
                      : "rounded-bl-sm border border-navy-700 bg-navy-800 text-slate-100",
                  ].join(" ")}
                >
                  {m.text}
                </div>
              </div>
            );
          })}

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

        {/* Composer */}
        <div className="card mt-4 flex items-end gap-3 p-3">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={status !== "open"}
            placeholder={
              status === "open"
                ? "Type your answer… (Enter to send, Shift+Enter for newline)"
                : "Connection not active"
            }
            className="max-h-32 flex-1 resize-none bg-transparent px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={sendMessage}
            disabled={status !== "open" || !input.trim()}
            className="btn-primary px-5 py-2.5"
          >
            Send
          </button>
        </div>
      </div>
    </AppShell>
  );
}
