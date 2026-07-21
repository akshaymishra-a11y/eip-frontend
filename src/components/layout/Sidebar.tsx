import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Icon } from "../ui";

type NavItem = {
  label: string;
  to: string;
  icon: string;
  end?: boolean;
};

type NavGroup = {
  key: string;
  label: string;
  items: NavItem[];
};

const orgNav: NavItem[] = [
  { label: "Overview", to: "/", icon: "dashboard", end: true },
  { label: "Projects", to: "/projects", icon: "folder_copy" },
  { label: "Alerts", to: "/alerts", icon: "notifications_active" },
  { label: "Health Center", to: "/health", icon: "favorite" },
  { label: "Team", to: "/team", icon: "group" },
  { label: "Billing", to: "/billing", icon: "credit_card" },
  { label: "AI Settings", to: "/ai-settings", icon: "smart_toy" },
];

// Remembers which project-nav categories the user collapsed, independent of
// which project is open — the categories (Architecture, Delivery, ...) are
// the same across every project, so there's no reason to re-learn the
// preference per project.
const GROUPS_STORAGE_KEY = "eip:sidebar-groups";

function loadCollapsedGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCollapsedGroups(collapsed: Record<string, boolean>) {
  try {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(collapsed));
  } catch {
    // best-effort — localStorage can be unavailable (private browsing, quota)
  }
}

function projectNav(projectId: string): {
  top: NavItem[];
  groups: NavGroup[];
  bottom: NavItem;
} {
  const path = (segment: string) =>
    `/projects/${projectId}${segment ? `/${segment}` : ""}`;
  return {
    top: [
      {
        label: "Overview",
        to: path(""),
        icon: "space_dashboard",
        end: true,
      },
      {
        label: "Setup Guide",
        to: path("onboarding"),
        icon: "rocket_launch",
      },
    ],
    groups: [
      {
        key: "architecture",
        label: "Architecture",
        items: [
          {
            label: "System Architecture",
            to: path("architecture"),
            icon: "schema",
          },
          {
            label: "Cloud Architecture",
            to: path("cloud-architecture"),
            icon: "account_tree",
          },
        ],
      },
      {
        key: "delivery",
        label: "Delivery",
        items: [
          { label: "Delivery", to: path("delivery"), icon: "rocket_launch" },
          {
            label: "Delivery Health",
            to: path("delivery-health"),
            icon: "task_alt",
          },
          {
            label: "Requirements",
            to: path("requirements"),
            icon: "fact_check",
          },
        ],
      },
      {
        key: "observability",
        label: "Observability",
        items: [
          { label: "API", to: path("api"), icon: "api" },
          { label: "Errors", to: path("errors"), icon: "error" },
          { label: "Traces", to: path("traces"), icon: "route" },
          { label: "Logs", to: path("logs"), icon: "terminal" },
        ],
      },
      {
        key: "infrastructure",
        label: "Infrastructure",
        items: [
          { label: "Infrastructure", to: path("infrastructure"), icon: "dns" },
          { label: "Cloud & FinOps", to: path("cloud"), icon: "cloud" },
          { label: "Dependencies", to: path("dependencies"), icon: "hub" },
        ],
      },
      {
        key: "security",
        label: "Security & Incidents",
        items: [
          { label: "Security", to: path("security"), icon: "shield" },
          { label: "Incidents", to: path("incidents"), icon: "crisis_alert" },
        ],
      },
    ],
    bottom: { label: "Settings", to: path("settings"), icon: "settings" },
  };
}

function NavLinkItem({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary text-white"
            : "text-slate-300 hover:bg-sidebar-hover hover:text-white"
        }`
      }
    >
      <Icon name={item.icon} className="text-[20px]" />
      {item.label}
    </NavLink>
  );
}

function NavGroupSection({
  group,
  open,
  onToggle,
}: {
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-300 transition-colors"
      >
        <span>{group.label}</span>
        <Icon
          name={open ? "expand_more" : "chevron_right"}
          className="text-[16px]"
        />
      </button>
      {open && (
        <div className="space-y-0.5 mb-1">
          {group.items.map((item) => (
            <NavLinkItem key={item.to} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  project,
  userName,
  userRole,
}: {
  project?: { id: string; name: string } | null;
  userName: string;
  userRole: string;
}) {
  const location = useLocation();
  const [collapsedGroups, setCollapsedGroups] =
    useState<Record<string, boolean>>(loadCollapsedGroups);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveCollapsedGroups(next);
      return next;
    });
  };

  const nav = project ? projectNav(project.id) : null;

  return (
    <aside className="fixed left-0 top-0 h-full w-sidebar bg-sidebar border-r border-sidebar-border flex flex-col z-40">
      <div className="flex items-center gap-3 px-5 h-topbar border-b border-sidebar-border shrink-0">
        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
          <Icon name="schema" className="text-white text-[18px]" />
        </div>
        <div className="leading-tight">
          <div className="text-white text-sm font-semibold">Archonix</div>
          <div className="text-slate-400 text-[11px]">Enterprise Tier</div>
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto eip-scrollbar-hide px-3 py-3 space-y-0.5">
        {orgNav.map((item) => (
          <NavLinkItem key={item.to} item={item} />
        ))}

        {project && nav && (
          <div className="pt-3 mt-3 border-t border-sidebar-border">
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 truncate">
              {project.name}
            </p>
            <div className="space-y-0.5">
              {nav.top.map((item) => (
                <NavLinkItem key={item.to} item={item} />
              ))}
              {nav.groups.map((group) => (
                <NavGroupSection
                  key={group.key}
                  group={group}
                  // A collapsed group still opens automatically while one of its
                  // own pages is active, so navigating there (e.g. via a deep
                  // link) never hides the very page you're standing on.
                  open={
                    !collapsedGroups[group.key] ||
                    group.items.some((item) =>
                      location.pathname.startsWith(item.to),
                    )
                  }
                  onToggle={() => toggleGroup(group.key)}
                />
              ))}
              <NavLinkItem item={nav.bottom} />
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 px-2 py-2 rounded-md transition-colors ${
              isActive ? "bg-sidebar-hover" : "hover:bg-sidebar-hover"
            }`
          }
        >
          <div className="w-8 h-8 rounded-full bg-primary/30 text-white flex items-center justify-center text-xs font-semibold shrink-0">
            {userName.slice(0, 2).toUpperCase()}
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-white text-sm font-medium truncate">
              {userName}
            </div>
            <div className="text-slate-400 text-xs truncate">{userRole}</div>
          </div>
        </NavLink>
      </div>
    </aside>
  );
}
