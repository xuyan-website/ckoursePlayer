import ReactDOM from "react-dom/client";
import { StrictMode } from "react";
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <PostHogProvider apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN} options={posthogOptions}>
      <ErrorBoundary>
        <HashRouter>
          <App />
        </HashRouter>
        <Toaster />
      </ErrorBoundary>
    </PostHogProvider>
  </StrictMode>
);
