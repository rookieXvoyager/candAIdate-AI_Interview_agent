import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ProgressBar from "./ProgressBar";
import Logo from "./Logo";
import AmbientBackground from "./AmbientBackground";

const navItems = [
  { to: "/dashboard", label: "New Interview" },
  { to: "/history", label: "History" },
];

// Common chrome for the authenticated funnel pages: brand header, nav, user menu,
// and the step progress bar.
export default function AppShell({ step, children }) {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const initial = (currentUser?.email?.[0] || "U").toUpperCase();

  const navClass = ({ isActive }) =>
    `rounded-xl px-4 py-2 text-sm font-semibold transition ${
      isActive
        ? "bg-brand-600/20 text-white ring-1 ring-brand-500/40"
        : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
    }`;

  return (
    <div className="min-h-screen">
      <AmbientBackground />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-navy-950/60 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl">
        <div className="mx-auto flex h-[80px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" aria-label="candAIdate home" className="shrink-0">
              <Logo markClassName="h-11 w-11" textClassName="text-2xl" />
            </Link>
            <nav className="hidden items-center gap-2 sm:flex">
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={navClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* User identity */}
            <div className="hidden items-center gap-2.5 sm:flex">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-sky-500 text-sm font-bold text-white shadow-inner">
                {initial}
              </div>
              <span className="max-w-[14rem] truncate text-sm font-medium text-slate-300">
                {currentUser?.email}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-300"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Mobile nav row */}
        <nav className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5 sm:hidden">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {step && (
          <div className="mb-8 sm:mb-10">
            <ProgressBar current={step} />
          </div>
        )}
        <div className="animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
