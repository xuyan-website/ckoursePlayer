import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Routes, Route, useLocation } from "react-router-dom";
import { AppShell } from "@/components/app-shell/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { ActivePathContext } from "@/hooks/usePageVisible";
import { sectionMemory } from "@/hooks/useSectionMemory";
import { SettingsContext, useSettingsProvider } from "@/hooks/useSettings";
import {
  UpdaterContext,
  useUpdaterProvider,
  useStartupUpdateCheck,
} from "@/hooks/useUpdater";
import { UpdateBanner } from "@/components/UpdateBanner";

const CourseDetail = lazy(() => import("@/pages/CourseDetail").then(m => ({ default: m.CourseDetail })));
const ImportCourse = lazy(() => import("@/pages/ImportCourse").then(m => ({ default: m.ImportCourse })));
const Bookmarks = lazy(() => import("@/pages/Bookmarks").then(m => ({ default: m.Bookmarks })));
const Progress = lazy(() => import("@/pages/Progress").then(m => ({ default: m.Progress })));
const Notes = lazy(() => import("@/pages/Notes").then(m => ({ default: m.Notes })));
const Settings = lazy(() => import("@/pages/Settings").then(m => ({ default: m.Settings })));

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-primary" />
    </div>
  );
}

function routeKey(pathname: string, search: string): string {
  if (pathname.startsWith("/course/")) {
    const section = sectionRoot(pathname, search);
    return `${pathname}::${section}`;
  }
  return pathname;
}

function sectionRoot(pathname: string, search: string): string {
  if (pathname.startsWith("/course/")) {
    const params = new URLSearchParams(search);
    const from = params.get("from");
    return from ? from.split("?")[0] : "/";
  }
  return pathname;
}

const TRANSIENT_ROUTES = new Set(["/import"]);

/**
 * Keep-alive router: caches page instances so they preserve state when
 * navigating away. Course pages are keyed by origin section so the same
 * course opened from Dashboard vs Bookmarks gets separate cached instances.
 * Routes in TRANSIENT_ROUTES always mount fresh.
 */
function KeepAliveRoutes() {
  const location = useLocation();
  const key = routeKey(location.pathname, location.search);
  const isTransient = TRANSIENT_ROUTES.has(location.pathname);

  const [cache, setCache] = useState<Map<string, ReturnType<typeof useLocation>>>(
    () => isTransient ? new Map() : new Map([[key, { ...location }]]),
  );

  useEffect(() => {
    if (isTransient) return;
    const section = sectionRoot(location.pathname, location.search);
    sectionMemory.set(section, location.pathname + location.search);
  }, [location, isTransient]);

  useEffect(() => {
    if (isTransient) return;
    setCache((prev) => {
      const next = new Map(prev);
      next.set(key, { ...location });
      for (const cachedKey of next.keys()) {
        if (cachedKey !== key && cachedKey.startsWith("/course/")) {
          next.delete(cachedKey);
        }
      }
      return next;
    });
  }, [location, key, isTransient]);

  return (
    <ActivePathContext.Provider value={key}>
      {Array.from(cache.entries()).map(([cachedKey, cachedLocation]) => (
        <div
          key={cachedKey}
          style={{ display: cachedKey === key ? undefined : "none" }}
        >
          <Suspense fallback={<PageLoader />}>
            <Routes location={cachedLocation}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/bookmarks" element={<Bookmarks />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/course/:courseId" element={<CourseDetail />} />
            </Routes>
          </Suspense>
        </div>
      ))}

      {isTransient && (
        <Suspense fallback={<PageLoader />}>
          <Routes location={location}>
            <Route path="/import" element={<ImportCourse />} />
          </Routes>
        </Suspense>
      )}
    </ActivePathContext.Provider>
  );
}

function App() {
  const settingsCtx = useSettingsProvider();
  const updaterCtx = useUpdaterProvider();
  useStartupUpdateCheck(updaterCtx, {
    enabled: settingsCtx.settings.auto_update_check,
    loaded: settingsCtx.loaded,
  });
  const { i18n } = useTranslation();

  useEffect(() => {
    if (settingsCtx.loaded && settingsCtx.settings.language !== i18n.language) {
      i18n.changeLanguage(settingsCtx.settings.language);
    }
  }, [settingsCtx.loaded, settingsCtx.settings.language, i18n]);

  return (
    <SettingsContext.Provider value={settingsCtx}>
      <UpdaterContext.Provider value={updaterCtx}>
        <AppShell>
          <KeepAliveRoutes />
        </AppShell>
        <UpdateBanner />
      </UpdaterContext.Provider>
    </SettingsContext.Provider>
  );
}

export default App;
