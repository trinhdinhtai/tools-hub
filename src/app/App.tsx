import { useEffect, useEffectEvent, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import type { i18n } from "i18next";
import { Search, Settings as SettingsIcon, type LucideIcon } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Kbd } from "@/components/kbd";
import { Logo } from "@/components/logo";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePreference, useRecent } from "@/lib/preferences";
import { PreferencesContext } from "@/lib/preferences-context";
import type { ToolMeta } from "@/lib/tool";
import { FilesContext } from "@/lib/files";
import type { ColorScheme, Platform } from "@/platform/types";
import { TOOLS_NS, createI18n } from "@/i18n";
import { colorSchemeFor, localeFor, schemasFor, type Language, type Theme } from "./app-preferences";
import { useDesktopPreferences, useGlobalHotkey } from "./desktop";
import { useFavorites } from "./favorites";
import { CommandPalette, isPaletteShortcut, paletteShortcutLabel } from "./Palette";
import { pastedOnApp, suggestTools } from "./paste-detection";
import { PasteSuggestions, type Pasted } from "./PasteSuggestions";
import { loadPreferences, type Preferences } from "./preferences";
import { tools, toolsByCategory, toolsWithIds } from "./registry";
import { SettingsDialog } from "./Settings";
import { WorkspaceView, useWorkspace, type Handoff } from "./Workspace";

interface Loaded {
  i18n: i18n;
  preferences: Preferences;
  osLocale: string | null;
}

export function App({ platform }: { platform: Platform }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([platform.getOsLocale().catch(() => null), loadPreferences(platform.store, schemasFor(tools))])
      .then(async ([osLocale, preferences]) => {
        const i18n = await createI18n(localeFor(preferences.get("app").language, osLocale));
        return { i18n, preferences, osLocale };
      })
      .then((next) => {
        if (!cancelled) setLoaded(next);
      });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  if (!loaded) return null;
  return (
    <PreferencesContext.Provider value={loaded.preferences}>
      <I18nextProvider i18n={loaded.i18n}>
        {/* One delay for every tooltip; moving between hinted buttons shows the next one at once. */}
        <TooltipProvider delay={500}>
          <Shell platform={platform} osLocale={loaded.osLocale} />
        </TooltipProvider>
      </I18nextProvider>
    </PreferencesContext.Provider>
  );
}

/** Applies the language Preference live, without a restart. */
function useLanguage(osLocale: string | null) {
  const { i18n } = useTranslation();
  const [language] = usePreference<Language>("language");
  const locale = localeFor(language, osLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [i18n, locale]);
}

/** Applies the theme Preference; "system" follows the OS theme as it changes. */
function useTheme(platform: Platform) {
  const [theme] = usePreference<Theme>("theme");
  const system = useSyncExternalStore(platform.systemTheme.subscribe, platform.systemTheme.get);
  const scheme = colorSchemeFor(theme, system);
  useEffect(() => applyColorScheme(scheme), [scheme]);
}

/**
 * Switches the theme in one frame. Transitions are off while the class flips: otherwise backgrounds change at once
 * while `transition-colors` text fades over 150ms, and labels briefly vanish (dark text on the new dark background).
 */
function applyColorScheme(scheme: ColorScheme) {
  const root = document.documentElement;
  root.style.colorScheme = scheme;
  if (root.classList.contains("dark") === (scheme === "dark")) return;
  root.classList.add("theme-switching");
  root.classList.toggle("dark", scheme === "dark");
  void document.body.offsetWidth; // restyle the whole page now, while transitions are still off
  requestAnimationFrame(() => root.classList.remove("theme-switching"));
}

function Shell({ platform, osLocale }: { platform: Platform; osLocale: string | null }) {
  const { t } = useTranslation();
  const { workspace, setWorkspace, open } = useWorkspace(tools);
  const [recent, addRecent] = useRecent();
  const [favorites, toggleFavorite] = useFavorites(tools.map((tool) => tool.id));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pasted, setPasted] = usePasteDetection();
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  useLanguage(osLocale);
  useTheme(platform);
  useDesktopPreferences(platform);
  const globalHotkey = useGlobalHotkey(platform, () => {
    setSettingsOpen(false);
    setPaletteOpen(true);
  });

  /** Opens a Tool (or shows its tab) and puts it first in the app's Recent. */
  const openAndRemember = (id: string) => {
    open(id);
    addRecent(id);
  };

  // Ctrl+K (Cmd+K on macOS) opens the palette from anywhere, even from inside a Tool's Input.
  const { isMac } = platform;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event, isMac)) return;
      event.preventDefault();
      setSettingsOpen(false);
      setPaletteOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMac]);

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex h-14 items-center px-4">
          <Logo className="h-6 w-auto" />
        </div>
        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={paletteOpen}
            aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md border bg-background px-2 text-left text-muted-foreground transition-colors duration-150",
              "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            <Search className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="flex-1 truncate">{t("palette.title")}</span>
            <Kbd className="text-muted-foreground">{paletteShortcutLabel(isMac)}</Kbd>
          </button>
        </div>
        <nav aria-label={t("nav.label")} className="flex-1 overflow-y-auto px-2 pb-4">
          {[
            ["favorites", t("favorites.label"), toolsWithIds(tools, favorites)] as const,
            ...toolsByCategory(tools).map(([category, list]) => [category, t(`categories.${category}`), list] as const),
          ]
            .filter(([, , list]) => list.length > 0)
            .map(([key, title, list]) => (
              <SidebarSection key={key} title={title}>
                {list.map((tool) => (
                  <li key={tool.id}>
                    <SidebarItem
                      tool={tool}
                      active={tool.id === workspace.active}
                      favorite={favorites.includes(tool.id)}
                      onSelect={() => openAndRemember(tool.id)}
                      onToggleFavorite={() => toggleFavorite(tool.id)}
                    />
                  </li>
                ))}
              </SidebarSection>
            ))}
        </nav>
        <div className="border-t p-2">
          <NavButton
            active={settingsOpen}
            onSelect={() => setSettingsOpen(true)}
            icon={SettingsIcon}
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
          >
            {t("settings.title")}
          </NavButton>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <FilesContext.Provider value={platform.files}>
          <WorkspaceView
            tools={tools}
            workspace={workspace}
            onChange={setWorkspace}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            handoff={handoff}
          />
        </FilesContext.Provider>
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} tools={tools} recent={recent} onPick={openAndRemember} />
      <PasteSuggestions
        tools={tools}
        pasted={pasted}
        onClose={() => setPasted(null)}
        onPick={(id, text) => {
          // The pasted text waits here only until the Tool takes it as its Input.
          const next: Handoff = { toolId: id, text, taken: () => setHandoff((current) => (current === next ? null : current)) };
          setHandoff(next);
          openAndRemember(id);
        }}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} platform={platform} globalHotkey={globalHotkey} />
    </div>
  );
}

/**
 * Paste Detection: a paste on the app's empty space (not in a field or a dialog) asks every Tool's `detectPaste` and
 * suggests the Tools that match. Only the user's own paste events are handled; the clipboard is never read.
 */
function usePasteDetection() {
  const [enabled] = usePreference<boolean>("pasteDetection");
  const [pasted, setPasted] = useState<Pasted | null>(null);
  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    if (!enabled || !pastedOnApp(event)) return;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    const ids = suggestTools(tools, text);
    if (ids.length === 0) return;
    event.preventDefault();
    setPasted({ text, ids });
  });
  useEffect(() => {
    const listener = (event: ClipboardEvent) => onPaste(event);
    window.addEventListener("paste", listener);
    return () => window.removeEventListener("paste", listener);
  }, []);
  return [pasted, setPasted] as const;
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mt-6 first:mt-2">
      <h2 id={id} className="mb-2 px-2 text-xs text-muted-foreground">
        {title}
      </h2>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}

/** A Tool in the sidebar. Right-click, Shift+F10 or the Menu key opens its menu, to pin or unpin it. */
function SidebarItem({
  tool,
  active,
  favorite,
  onSelect,
  onToggleFavorite,
}: {
  tool: ToolMeta;
  active: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  const { t } = useTranslation();
  const { t: tTools } = useTranslation(TOOLS_NS);
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div role="presentation" />}>
        <NavButton active={active} onSelect={onSelect} icon={tool.icon}>
          {tTools(`${tool.id}.name`)}
        </NavButton>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onToggleFavorite}>{t(favorite ? "favorites.remove" : "favorites.add")}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** A sidebar entry. It marks the current page with `aria-current`, unless it opens a dialog (`aria-haspopup`). */
function NavButton({
  active,
  onSelect,
  icon: Icon,
  children,
  ...aria
}: {
  active: boolean;
  onSelect: () => void;
  icon: LucideIcon;
  children: ReactNode;
  "aria-haspopup"?: "dialog";
  "aria-expanded"?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active && !aria["aria-haspopup"] ? "page" : undefined}
      {...aria}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-subtle-foreground transition-colors duration-150",
        "hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active && "bg-accent text-foreground shadow-[inset_0_0_0_1px_var(--border)]",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} strokeWidth={1.5} aria-hidden />
      <span className="truncate">{children}</span>
    </button>
  );
}
