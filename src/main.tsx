import ReactDOM from "react-dom/client";
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { HashRouter } from "react-router-dom";
import { PostHogProvider } from "@posthog/react";
import App from "./App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";
import "./i18n";

const posthogOptions = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: "2026-01-30",
  exception_autocapture: true,
  // Disable web-vitals performance monitoring. PostHog's transitive dependency
  // web-vitals throws "Cannot read properties of undefined (reading 'startTime')"
  // in the Tauri WebView where PerformanceObserver behaviour differs from a
  // normal browser. Tauri serves the frontend over http://tauri.localhost so
  // the protocol guard inside web-vitals does not skip it — we opt out explicitly.
  capture_performance: false,
} as const;

// Always render PostHogProvider so children fiber stays stable (no remount).
// Pass apiKey=undefined initially to skip PostHog SDK init, then enable on idle
// so its network setup does not compete with first paint. SDK calls before init
// are no-ops, so early capture attempts are safely ignored.
function LazyPostHogProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const schedule = () => setEnabled(true);
    const scheduler = window as unknown as Partial<{
      requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback: (handle: number) => void;
    }>;
    const ric = scheduler.requestIdleCallback;
    const cic = scheduler.cancelIdleCallback;
    if (ric && cic) {
      const handle = ric(schedule, { timeout: 3000 });
      return () => cic(handle);
    }
    const timer = setTimeout(schedule, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <PostHogProvider
      apiKey={enabled ? import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN : undefined}
      options={posthogOptions}
    >
      {children}
    </PostHogProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <LazyPostHogProvider>
      <ErrorBoundary>
        <HashRouter>
          <App />
        </HashRouter>
        <Toaster />
      </ErrorBoundary>
    </LazyPostHogProvider>
  </StrictMode>
);
