import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  Mic,
  Pause,
  Square,
  Volume2,
  VolumeX,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useInterview } from "../context/InterviewContext";
import { API_BASE, WS_BASE } from "../lib/api";
import AppShell from "../components/AppShell";

function appendTranscript(base, next) {
  const left = base.trimEnd();
  const right = next.trim();
  return left && right ? `${left} ${right}` : left || right;
}

export default function LiveInterview() {
  const { getToken } = useAuth();
  const { sessionId, setEvaluation } = useInterview();
  const navigate = useNavigate();

  const wsRef = useRef(null);
  const scrollRef = useRef(null);
  const endingRef = useRef(false);
  const interviewCompleteRef = useRef(false);
  const recognitionRef = useRef(null);
  const recorderStateRef = useRef("idle");
  const baseTranscriptRef = useRef("");
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const inputRef = useRef("");
  const voiceEnabledRef = useRef(true);
  const pendingGreetingRef = useRef("");
  const generateFeedbackRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("connecting");
  const [aiThinking, setAiThinking] = useState(false);
  const [recorderState, setRecorderState] = useState("idle");
  const [sttNotice, setSttNotice] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceUnlockRequired, setVoiceUnlockRequired] = useState(false);
  const [ending, setEnding] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const cancelVoice = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const speakText = (text, allowUnlock = false) => {
    if (!text || !voiceEnabledRef.current) {
      return Promise.resolve();
    }
    if (!("speechSynthesis" in window)) {
      setVoiceUnlockRequired(false);
      return Promise.resolve();
    }

    window.speechSynthesis.cancel();

    return new Promise((resolve) => {
      let settled = false;
      let startTimer = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (startTimer) window.clearTimeout(startTimer);
        setIsSpeaking(false);
        resolve();
      };

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(
        (voice) => voice.lang?.toLowerCase().startsWith("en")
      );
      if (englishVoice) utterance.voice = englishVoice;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => {
        setIsSpeaking(true);
        setVoiceUnlockRequired(false);
        if (startTimer) window.clearTimeout(startTimer);
      };
      utterance.onend = finish;
      utterance.onerror = (event) => {
        if (
          allowUnlock &&
          (event?.error === "not-allowed" || event?.error === "blocked")
        ) {
          pendingGreetingRef.current = text;
          setVoiceUnlockRequired(true);
        }
        finish();
      };

      window.speechSynthesis.speak(utterance);

      if (allowUnlock) {
        startTimer = window.setTimeout(() => {
          if (!settled) {
            pendingGreetingRef.current = text;
            setVoiceUnlockRequired(true);
          }
        }, 700);
      }
    });
  };

  const enableVoice = () => {
    const text =
      pendingGreetingRef.current ||
      messages.find((message) => message.speaker === "Interviewer")?.text ||
      "";
    setVoiceEnabled(true);
    voiceEnabledRef.current = true;
    setVoiceUnlockRequired(false);
    if (text) void speakText(text, false);
  };

  const toggleVoice = () => {
    const next = !voiceEnabledRef.current;
    voiceEnabledRef.current = next;
    setVoiceEnabled(next);
    setVoiceUnlockRequired(false);
    if (!next) cancelVoice();
  };

  const stopRecognition = (nextState = "idle", freezeInput = true) => {
    const recognition = recognitionRef.current;
    if (freezeInput) {
      baseTranscriptRef.current = inputRef.current.trimEnd();
    }
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    recorderStateRef.current = nextState;
    setRecorderState(nextState);
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Recognition may already be stopped.
      }
    }
  };

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSttNotice("Voice recording is not supported in this browser.");
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setSttNotice("");
    };

    recognition.onresult = (event) => {
      if (recorderStateRef.current !== "recording") return;

      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript || "";
        if (result.isFinal) {
          finalText += `${text.trim()} `;
        } else {
          interimText += text;
        }
      }

      if (finalText.trim()) {
        finalTranscriptRef.current = appendTranscript(
          finalTranscriptRef.current,
          finalText
        );
      }
      interimTranscriptRef.current = interimText.trim();

      const liveText = appendTranscript(
        appendTranscript(
          baseTranscriptRef.current,
          finalTranscriptRef.current
        ),
        interimTranscriptRef.current
      );
      inputRef.current = liveText;
      setInput(liveText);
    };

    recognition.onerror = (event) => {
      if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
        stopRecognition("idle", true);
        setSttNotice("Microphone permission is needed to use voice recording.");
      } else if (event?.error !== "aborted" && event?.error !== "no-speech") {
        setSttNotice("Voice recording paused unexpectedly. Try Resume.");
      }
    };

    recognition.onend = () => {
      if (
        recorderStateRef.current === "recording" &&
        !endingRef.current &&
        !interviewCompleteRef.current
      ) {
        window.setTimeout(() => {
          if (recorderStateRef.current === "recording") {
            try {
              recognition.start();
            } catch {
              // Recognition may already be restarting.
            }
          }
        }, 150);
      }
    };

    recognitionRef.current = recognition;
    return () => {
      recorderStateRef.current = "idle";
      try {
        recognition.stop();
      } catch {
        // Recognition may already be stopped.
      }
      recognitionRef.current = null;
      cancelVoice();
    };
  }, []);

  const startRecording = () => {
    if (endingRef.current || interviewCompleteRef.current) return;
    cancelVoice();
    const recognition = recognitionRef.current;
    if (!recognition) {
      setSttNotice("Voice recording is not supported in this browser.");
      return;
    }

    baseTranscriptRef.current =
      recorderStateRef.current === "paused"
        ? inputRef.current.trimEnd()
        : inputRef.current.trimEnd();
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    recorderStateRef.current = "recording";
    setRecorderState("recording");
    setSttNotice("");

    try {
      recognition.start();
    } catch (error) {
      setSttNotice("Could not start voice recording. Please try again.");
      stopRecognition("idle", true);
    }
  };

  const pauseRecording = () => {
    if (recorderStateRef.current !== "recording") return;
    const frozenText = inputRef.current.trimEnd();
    baseTranscriptRef.current = frozenText;
    inputRef.current = frozenText;
    setInput(frozenText);
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    stopRecognition("paused", false);
  };

  const resumeRecording = () => {
    startRecording();
  };

  const stopRecording = () => {
    stopRecognition("idle", true);
  };

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

            if (parsed.type === "interview_complete") {
              const closing =
                parsed.content || parsed.text || "Thank you. That concludes the interview.";
              void handleInterviewComplete(closing);
              return;
            }

            if (
              parsed.type === "ai_response" ||
              parsed.type === "ai_message"
            ) {
              setAiThinking(false);
              const text =
                parsed.content || parsed.text || "The interviewer has responded.";
              setMessages((previous) => [
                ...previous,
                { speaker: "Interviewer", text },
              ]);
              pendingGreetingRef.current = text;
              void speakText(text, messages.length === 0);
              if (parsed.interview_complete) {
                void handleInterviewComplete(text);
              }
            }
          } catch (error) {
            console.error("WS parse error", error);
          }
        };

        socket.onclose = () => {
          if (wsRef.current === socket) {
            setStatus(endingRef.current ? "closed" : "error");
          }
        };
      } catch {
        if (active) setStatus("error");
      }
    })();

    return () => {
      active = false;
      if (socket) socket.close();
      cancelVoice();
      stopRecognition("idle", true);
    };
  }, [sessionId, getToken, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, aiThinking]);

  const sendMessage = () => {
    if (endingRef.current || interviewCompleteRef.current) return;
    const text = inputRef.current.trim();
    if (!text || status !== "open") return;

    cancelVoice();
    stopRecognition("idle", false);
    wsRef.current?.send(JSON.stringify({ type: "text", text }));
    setMessages((previous) => [
      ...previous,
      { speaker: "Candidate", text },
    ]);
    inputRef.current = "";
    setInput("");
    setAiThinking(true);
  };

  const generateFeedback = async () => {
    if (!sessionId || endingRef.current) return;

    setEnding(true);
    endingRef.current = true;
    setFeedbackError("");
    stopRecognition("idle", true);
    cancelVoice();

    try {
      if (
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN
      ) {
        wsRef.current.close(1000, "Interview ended");
      }

      const token = await getToken();
      const response = await fetch(
        `${API_BASE}/api/v1/evaluate/${encodeURIComponent(sessionId)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.detail || `Feedback generation failed (${response.status}).`
        );
      }

      const payload = await response.json();
      setEvaluation(
        payload?.data && typeof payload.data === "object"
          ? payload.data
          : {
              score: 0,
              overall_score: 0,
              strengths: [],
              weaknesses: [],
              detailed_feedback:
                "The interview ended before a report could be generated.",
              ended_early: true,
              candidate_answer_count: 0,
              metrics: [],
            }
      );
      navigate("/feedback", { replace: true, state: { sessionId } });
    } catch (error) {
      endingRef.current = false;
      setEnding(false);
      setFeedbackError(
        error?.message || "Could not generate feedback. Please try again."
      );
    }
  };
  generateFeedbackRef.current = generateFeedback;

  const handleInterviewComplete = async (closingText) => {
    if (interviewCompleteRef.current) return;
    interviewCompleteRef.current = true;
    setInterviewComplete(true);
    setAiThinking(false);
    stopRecognition("idle", true);
    cancelVoice();

    if (voiceEnabledRef.current) {
      await Promise.race([
        speakText(closingText, false),
        new Promise((resolve) => window.setTimeout(resolve, 8000)),
      ]);
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }

    await generateFeedbackRef.current();
  };

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      sendMessage();
    }
  };

  const statusMeta =
    {
      connecting: { label: "Connecting…", color: "bg-amber-400" },
      open: { label: "Live", color: "bg-emerald-400" },
      closed: { label: "Ended", color: "bg-slate-500" },
      error: { label: "Disconnected", color: "bg-rose-400" },
    }[status] || { label: "Disconnected", color: "bg-rose-400" };

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-4xl flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border border-navy-700 bg-navy-800 p-4">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-brand-400" />
            <h2 className="text-lg font-semibold text-white">AI Interviewer</h2>
            <div className="flex items-center gap-2 rounded-full border border-navy-700 bg-navy-900 px-3 py-1 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${statusMeta.color} ${
                  status === "open" ? "animate-pulse" : ""
                }`}
              />
              <span className="text-slate-300">{statusMeta.label}</span>
            </div>
            {isSpeaking && (
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs text-sky-300">
                Speaking...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleVoice}
              disabled={ending || interviewComplete}
              className="flex items-center gap-2 rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
            >
              {voiceEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
              {voiceEnabled ? "Mute Voice" : "Unmute Voice"}
            </button>
            <button
              type="button"
              onClick={generateFeedback}
              disabled={ending || interviewComplete}
              className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-4 py-2 text-sm text-rose-400 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Square className="h-4 w-4" />
              {ending ? "Generating feedback..." : "End & Get Feedback"}
            </button>
          </div>
        </div>

        {voiceUnlockRequired && (
          <div className="flex items-center justify-between border-x border-b border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-200">
            <span>Your browser blocked voice playback.</span>
            <button
              type="button"
              onClick={enableVoice}
              className="rounded-lg border border-sky-400/40 px-3 py-1.5 font-semibold"
            >
              Enable Voice
            </button>
          </div>
        )}

        {interviewComplete && (
          <div className="border-x border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Interview complete — generating your feedback...
          </div>
        )}

        {feedbackError && (
          <div className="flex items-center justify-between gap-4 border-x border-b border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <span>{feedbackError}</span>
            <button
              type="button"
              onClick={generateFeedback}
              className="shrink-0 rounded-lg border border-rose-400/40 px-3 py-1.5 font-semibold text-rose-200"
            >
              Retry Generating Feedback
            </button>
          </div>
        )}

        {sttNotice && (
          <div className="border-x border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            {sttNotice}
          </div>
        )}

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto border-x border-navy-700 bg-navy-900/50 p-5 scroll-smooth"
        >
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.speaker === "Candidate"
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  message.speaker === "Candidate"
                    ? "rounded-br-sm bg-brand-600 text-white"
                    : "rounded-bl-sm border border-navy-700 bg-navy-800 text-slate-100"
                }`}
              >
                <div>{message.text}</div>
                {message.speaker === "Interviewer" && (
                  <button
                    type="button"
                    onClick={() => speakText(message.text, false)}
                    disabled={!voiceEnabled || ending}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-sky-300 disabled:opacity-50"
                    aria-label="Replay interviewer message"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Replay
                  </button>
                )}
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

        <div className="flex flex-wrap items-end gap-3 rounded-b-2xl border border-navy-700 bg-navy-800 p-4">
          {recorderState === "idle" && (
            <button
              type="button"
              onClick={startRecording}
              disabled={ending || interviewComplete}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-navy-600 bg-navy-900 text-slate-300 hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Record answer"
            >
              <Mic className="h-5 w-5" />
            </button>
          )}
          {recorderState === "recording" && (
            <>
              <button
                type="button"
                onClick={pauseRecording}
                className="flex h-12 items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-sm text-amber-300"
              >
                <Pause className="h-4 w-4" />
                Pause
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="flex h-12 items-center gap-2 rounded-xl border border-navy-600 px-3 text-sm text-slate-300"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
              <span className="h-12 flex items-center text-xs font-semibold text-rose-300">
                Recording
              </span>
            </>
          )}
          {recorderState === "paused" && (
            <>
              <span className="flex h-12 items-center rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-sm text-amber-300">
                Paused
              </span>
              <button
                type="button"
                onClick={resumeRecording}
                className="flex h-12 items-center gap-2 rounded-xl border border-brand-500/40 px-3 text-sm text-brand-300"
              >
                <Mic className="h-4 w-4" />
                Resume
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="flex h-12 items-center gap-2 rounded-xl border border-navy-600 px-3 text-sm text-slate-300"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            </>
          )}

          <textarea
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={ending || interviewComplete}
            className="max-h-32 min-h-12 flex-1 resize-y rounded-xl border border-navy-600 bg-navy-900 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="Type your answer or click the mic to record... (Enter to send, Shift+Enter for new line)"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={
              ending ||
              interviewComplete ||
              !input.trim() ||
              status !== "open"
            }
            className="flex h-12 items-center justify-center rounded-xl bg-brand-600 px-6 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </div>
    </AppShell>
  );
}
