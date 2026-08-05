import { NavLink } from "react-router-dom";
import { Boxes, LayoutDashboard, LayoutTemplate, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { cn } from "../../lib/cn";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/environments", label: "Environments", icon: Boxes },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/settings", label: "Settings", icon: Settings },
];

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex flex-col shrink-0 h-full bg-sidebar border-r border-sidebar-border transition-[width] duration-150",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex items-center h-14 border-b border-sidebar-border shrink-0", collapsed ? "justify-center px-0" : "justify-between px-4")}>
        {!collapsed && (
          <span className="text-sidebar-text-active font-semibold text-sm tracking-wide">BoxWizard</span>
        )}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="text-sidebar-text hover:text-sidebar-text-active hover:bg-sidebar-hover rounded-md p-1.5 transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-sidebar-active text-sidebar-text-active"
                  : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active",
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-4 py-3 text-[11px] text-sidebar-text/70 border-t border-sidebar-border">
          Short-lived sandboxes,<br />one click at a time.
        </div>
      )}
    </aside>
  );
}
