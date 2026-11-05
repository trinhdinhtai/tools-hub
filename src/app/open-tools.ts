/** The Open Tools of the workspace: one tab per Tool id, in tab order, and the id of the tab on screen. */
export interface Workspace {
  readonly ids: readonly string[];
  readonly active: string | null;
}

export const EMPTY_WORKSPACE: Workspace = { ids: [], active: null };

/** Opens a Tool as the last tab, or switches to its tab if it is already open: never two tabs of one Tool. */
export function openTool(workspace: Workspace, id: string): Workspace {
  return { ids: workspace.ids.includes(id) ? workspace.ids : [...workspace.ids, id], active: id };
}

/** Puts an open tab on screen. */
export function showTool(workspace: Workspace, id: string): Workspace {
  return workspace.ids.includes(id) ? { ...workspace, active: id } : workspace;
}

/** Closes a tab. When it was on screen, the tab to its right takes its place, or the one to its left if it was last. */
export function closeTool(workspace: Workspace, id: string): Workspace {
  const index = workspace.ids.indexOf(id);
  if (index < 0) return workspace;
  const ids = workspace.ids.filter((other) => other !== id);
  const active = workspace.active === id ? (ids[index] ?? ids[index - 1] ?? null) : workspace.active;
  return { ids, active };
}

/** Keeps only the given tab, and shows it. */
export function closeOthers(workspace: Workspace, id: string): Workspace {
  return workspace.ids.includes(id) ? { ids: [id], active: id } : workspace;
}

/** Closes every tab to the right of the given one; if the tab on screen was among them, the given one is shown. */
export function closeRight(workspace: Workspace, id: string): Workspace {
  const index = workspace.ids.indexOf(id);
  if (index < 0) return workspace;
  const ids = workspace.ids.slice(0, index + 1);
  return { ids, active: workspace.active && ids.includes(workspace.active) ? workspace.active : id };
}

export function closeAll(): Workspace {
  return EMPTY_WORKSPACE;
}

/**
 * The workspace as saved in the Preferences, as far as it still makes sense: ids of Tools that exist, once each,
 * and the saved active tab if it is among them (else the first tab).
 */
export function restoreWorkspace(ids: unknown, active: unknown, known: readonly string[]): Workspace {
  if (!Array.isArray(ids)) return EMPTY_WORKSPACE;
  const open = [...new Set(ids.filter((id): id is string => typeof id === "string" && known.includes(id)))];
  return { ids: open, active: open.includes(active as string) ? (active as string) : (open[0] ?? null) };
}
