// Shared ambient backdrop: faint grid + soft drifting light orbs.
// Fixed to the viewport so it persists behind scrolling content on every page.
export default function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-navy-950">
      <div className="absolute inset-0 bg-grid" />
      <div className="absolute -left-32 top-[-12%] h-[34rem] w-[34rem] animate-drift rounded-full bg-brand-600/20 blur-[120px]" />
      <div className="absolute bottom-[-18%] right-[-10%] h-[32rem] w-[32rem] animate-drift rounded-full bg-sky-500/15 blur-[120px] [animation-delay:-7s]" />
      <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[110px]" />
    </div>
  );
}
