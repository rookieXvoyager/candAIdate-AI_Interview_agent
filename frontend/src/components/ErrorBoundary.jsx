import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Application render error:", error);
    console.error("React component stack:", info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-950 px-5">
        <div className="glass w-full max-w-lg rounded-2xl p-7 text-center">
          <h1 className="text-xl font-bold text-white">Something went wrong</h1>
          <p className="mt-3 text-sm text-rose-300">
            {this.state.error?.message || "The page could not be rendered."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/dashboard";
              }}
              className="rounded-lg border border-navy-700 px-4 py-2 text-sm font-semibold text-slate-300"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
