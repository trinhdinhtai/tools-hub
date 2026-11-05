import { Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import type { i18n } from "i18next";
import { Settings as SettingsIcon, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { usePreference } from "@/lib/preferences";
import { NamespaceContext, PreferencesContext, toolNamespace } from "@/lib/preferences-context";
import type { ToolMeta } from "@/lib/tool";
import type { ColorScheme, Platform } from "@/platform/types";
import { TOOLS_NS, createI18n } from "@/i18n";
import { colorSchemeFor, localeFor, schemasFor, type Language, type Theme } from "./app-preferences";
import { loadPreferences, type Preferences } from "./preferences";
import { tools, toolsByCategory } from "./registry";
import { SettingsDialog } from "./Settings";

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
        <Shell platform={platform} osLocale={loaded.osLocale} />
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
  const [activeTool, setActiveTool] = useState<ToolMeta | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useLanguage(osLocale);
  useTheme(platform);

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex h-14 items-center px-4">
          <Logo className="h-6 w-auto" />
        </div>
        <nav aria-label={t("nav.label")} className="flex-1 overflow-y-auto px-2 pb-4">
          {toolsByCategory().map(([category, list]) => (
            <section key={category} className="mt-6 first:mt-2">
              <h2 className="mb-2 px-2 text-xs text-muted-foreground">{t(`categories.${category}`)}</h2>
              <ul className="flex flex-col gap-0.5">
                {list.map((tool) => (
                  <li key={tool.id}>
                    <SidebarItem tool={tool} active={tool.id === activeTool?.id} onSelect={() => setActiveTool(tool)} />
                  </li>
                ))}
              </ul>
            </section>
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
      <main className="min-w-0 flex-1 overflow-y-auto">
        {activeTool ? <ToolView key={activeTool.id} tool={activeTool} /> : <EmptyState />}
      </main>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} platform={platform} />
    </div>
  );
}

function SidebarItem({ tool, active, onSelect }: { tool: ToolMeta; active: boolean; onSelect: () => void }) {
  const { t } = useTranslation(TOOLS_NS);
  return (
    <NavButton active={active} onSelect={onSelect} icon={tool.icon}>
      {t(`${tool.id}.name`)}
    </NavButton>
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

function ToolView({ tool }: { tool: ToolMeta }) {
  const { t } = useTranslation(TOOLS_NS);
  const Component = tool.component;
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-8 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium">{t(`${tool.id}.name`)}</h1>
        <p className="text-subtle-foreground">{t(`${tool.id}.description`)}</p>
      </header>
      <NamespaceContext.Provider value={toolNamespace(tool.id)}>
        <Suspense fallback={null}>
          <Component />
        </Suspense>
      </NamespaceContext.Provider>
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-start justify-center gap-2 px-8">
      <h1 className="text-2xl font-medium">{t("empty.title")}</h1>
      <p className="max-w-md text-subtle-foreground">{t("empty.body")}</p>
    </div>
  );
}
