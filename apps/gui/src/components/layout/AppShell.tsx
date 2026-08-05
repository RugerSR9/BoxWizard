import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";

const COLLAPSE_BREAKPOINT_PX = 880;
const STORAGE_KEY = "boxwizard.sidebarCollapsed";

/**
 * Two-column shell (sidebar + content) shared by every page. New pages just
 * need a route + a Sidebar nav entry - this component itself never changes.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [manualCollapsed, setManualCollapsed] = useState<boolean | null>(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return stored === null ? null : stored === "true";
  });
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < COLLAPSE_BREAKPOINT_PX);

  useEffect(() => {
    function onResize() {
      setNarrow(window.innerWidth < COLLAPSE_BREAKPOINT_PX);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const collapsed = manualCollapsed ?? narrow;

  function toggle() {
    const next = !collapsed;
    setManualCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-ink">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}
