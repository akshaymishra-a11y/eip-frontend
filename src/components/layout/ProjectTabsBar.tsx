import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchProjects } from "../../lib/api";
import { useOrg } from "../../lib/org-context";
import type { Project } from "../../lib/types";
import { Icon } from "../ui";

type Tab = { id: string; name: string };
type TabsByOrg = Record<string, Tab[]>;

// Scoped per-organization — pinning a project files it under the
// *currently active* organization's own bucket, so switching organizations
// (or opening a project that belongs to a different org) never surfaces
// another organization's project names in this bar. Stored as a single
// { [orgId]: Tab[] } map (rather than one localStorage key per org) so
// there's one atomic lazy-init read at mount with no async race against
// which org is "current" yet. Just a UI convenience, not shared/synced
// data, so plain localStorage is enough.
const STORAGE_KEY = "eip:project-tabs";

// Keeps the bar from growing unbounded — pinning a 4th project quietly
// drops the oldest-opened one (FIFO) rather than blocking the action or
// reordering tabs on every click (which would make the bar feel jumpy).
const MAX_TABS = 3;

function addTab(prev: Tab[], tab: Tab): Tab[] {
  if (prev.some((t) => t.id === tab.id)) return prev;
  const next = [...prev, tab];
  return next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next;
}

function loadTabsByOrg(): TabsByOrg {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    // Guards against the old pre-org-scoping shape (a plain Tab[] array),
    // which would otherwise mix all orgs' tabs together under one bucket.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveTabsByOrg(tabsByOrg: TabsByOrg) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabsByOrg));
  } catch {
    // best-effort — localStorage can be unavailable (private browsing, quota)
  }
}

export function ProjectTabsBar({
  activeProject,
}: {
  activeProject?: { id: string; name: string } | null;
}) {
  const { currentOrganization } = useOrg();
  const orgId = currentOrganization?.id;
  const navigate = useNavigate();
  // Read straight from the URL rather than waiting on `activeProject` (which
  // only resolves once that page's own data fetch finishes) — otherwise every
  // tab switch has a beat where no tab looks active while the page loads.
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const [tabsByOrg, setTabsByOrg] = useState<TabsByOrg>(loadTabsByOrg);
  const tabs = orgId ? tabsByOrg[orgId] ?? [] : [];
  const [accessibleProjects, setAccessibleProjects] = useState<
    Project[] | null
  >(null);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveTabsByOrg(tabsByOrg), [tabsByOrg]);

  // Whatever project the user is currently viewing gets pinned automatically
  // — arriving via a bookmark, a search result, or a deep link should show
  // up as a tab immediately, not require manually re-adding it. Filed under
  // `orgId` (the org ProjectProvider synced to match this exact project), so
  // it always lands in the right org's bucket even for a cross-org deep link.
  useEffect(() => {
    if (!activeProject || !orgId) return;
    setTabsByOrg((prev) => ({ ...prev, [orgId]: addTab(prev[orgId] ?? [], { id: activeProject.id, name: activeProject.name }) }));
  }, [activeProject?.id, activeProject?.name, orgId]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setShowResults(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Cached per organization, reset when the active org changes so switching
  // orgs can't keep serving a stale (or worse, another org's) result set.
  useEffect(() => {
    setAccessibleProjects(null);
  }, [orgId]);

  // Fetched lazily (on first focus/keystroke) — scoped to the current
  // organization only, so search can never surface another org's projects.
  const loadAccessibleProjects = useCallback(async () => {
    if (accessibleProjects || !orgId) return;
    const list = await fetchProjects(orgId).catch(() => [] as Project[]);
    setAccessibleProjects(list);
  }, [orgId, accessibleProjects]);

  const results = useMemo(() => {
    if (!query.trim() || !accessibleProjects) return [];
    const q = query.trim().toLowerCase();
    return accessibleProjects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) && !tabs.some((t) => t.id === p.id),
      )
      .slice(0, 8);
  }, [query, accessibleProjects, tabs]);

  const openProject = (project: { id: string; name: string }) => {
    if (orgId) {
      setTabsByOrg((prev) => ({ ...prev, [orgId]: addTab(prev[orgId] ?? [], { id: project.id, name: project.name }) }));
    }
    setQuery("");
    setShowResults(false);
    navigate(`/projects/${project.id}`);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!orgId) return;
    const remaining = tabs.filter((t) => t.id !== id);
    setTabsByOrg((prev) => ({ ...prev, [orgId]: remaining }));
    if (routeProjectId === id) {
      navigate(
        remaining.length > 0
          ? `/projects/${remaining[remaining.length - 1].id}`
          : "/projects",
      );
    }
  };

  return (
    <div className="fixed top-topbar left-sidebar right-0 h-tabbar bg-surface border-b border-border flex items-center gap-3 px-4 z-20 shadow-sm mb-5">
      <div ref={boxRef} className="relative w-56 shrink-0">
        <Icon
          name="search"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[16px]"
        />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
            loadAccessibleProjects();
          }}
          onFocus={() => {
            setShowResults(true);
            loadAccessibleProjects();
          }}
          placeholder="Search projects..."
          autoComplete="off"
          className="w-full h-8 pl-9 pr-3 bg-background border border-border rounded-full text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
        {showResults && query.trim() && (
          <div className="absolute top-full left-0 mt-1.5 w-72 bg-surface border border-border rounded-lg shadow-lg py-1 max-h-72 overflow-y-auto z-30">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-text-secondary">
                No matching projects.
              </p>
            ) : (
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openProject(p)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-background"
                >
                  <span className="text-text-primary truncate">{p.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-border shrink-0" />

      <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 py-1">
        {tabs.length === 0 ? (
          <span className="text-xs text-text-muted">
            No projects pinned — search above or press + to open one (up to {MAX_TABS} at a time).
          </span>
        ) : (
          tabs.map((tab) => {
            const isActive = routeProjectId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigate(`/projects/${tab.id}`)}
                className={`group flex items-center gap-2 h-8 pl-3 pr-1.5 rounded-full text-xs shrink-0 border transition-colors ${
                  isActive
                    ? "bg-primary-light border-primary/30 text-primary font-semibold"
                    : "bg-background border-transparent text-text-secondary hover:border-border hover:text-text-primary"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-primary" : "bg-success"}`}
                />
                <span className="truncate max-w-[140px]">{tab.name}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => closeTab(tab.id, e)}
                  className="w-4 h-4 flex items-center justify-center rounded-full text-text-muted opacity-0 group-hover:opacity-100 hover:bg-border hover:text-danger transition-opacity"
                  title="Close tab"
                >
                  <Icon name="close" className="text-[12px]" />
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="w-px h-6 bg-border shrink-0" />

      <button
        type="button"
        onClick={() => {
          setShowResults(true);
          loadAccessibleProjects();
          searchRef.current?.focus();
        }}
        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-transparent text-text-secondary hover:bg-background hover:border-border hover:text-primary transition-colors"
        title={`Open another project (max ${MAX_TABS} pinned — opening more replaces the oldest tab)`}
      >
        <Icon name="add" className="text-[18px]" />
      </button>
    </div>
  );
}
