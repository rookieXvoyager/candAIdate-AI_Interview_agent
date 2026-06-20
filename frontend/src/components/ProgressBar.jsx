import { Check } from "lucide-react";

// Top funnel progress indicator shared across the flow.
const STEPS = ["Upload", "Profile", "Assessment", "Interview", "Feedback"];

export default function ProgressBar({ current = 1 }) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex items-center">
        {STEPS.map((label, i) => {
          const step = i + 1;
          const isDone = step < current;
          const isActive = step === current;
          return (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={[
                    "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition",
                    isActive
                      ? "border-brand-500 bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                      : isDone
                      ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                      : "border-navy-700 bg-navy-800 text-slate-500",
                  ].join(" ")}
                >
                  {isDone ? <Check className="h-4 w-4" /> : step}
                </div>
                <span
                  className={[
                    "mt-1.5 hidden text-xs font-medium sm:block",
                    isActive
                      ? "text-brand-400"
                      : isDone
                      ? "text-emerald-300/80"
                      : "text-slate-500",
                  ].join(" ")}
                >
                  {label}
                </span>
              </div>
              {step < STEPS.length && (
                <div
                  className={[
                    "mx-2 h-0.5 flex-1 rounded-full transition",
                    isDone ? "bg-emerald-500/50" : "bg-navy-700",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
