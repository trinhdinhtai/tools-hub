import { Suspense, useEffect, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import type { i18n } from "i18next";
import { cn } from "@/lib/utils";
import type { ToolMeta } from "@/lib/tool";
import type { Platform } from "@/platform/types";
import { TOOLS_NS, createI18n, resolveLocale } from "@/i18n";
import { toolsByCategory } from "./registry";

export function App({ platform }: { platform: Platform }) {
  const [i18n, setI18n] = useState<i18n | null>(null);

  useEffect(() => {
    let cancelled = false;
    platform
      .getOsLocale()
      .catch(() => null)
      .then((osLocale) => createI18n(resolveLocale(osLocale)))
      .then((instance) => {
        if (cancelled) return;
        document.documentElement.lang = instance.language;
        setI18n(instance);
      });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  if (!i18n) return null;
  return (
    <I18nextProvider i18n={i18n}>
      <Shell />
    </I18nextProvider>
  );
}

function Shell() {
  const { t } = useTranslation();
  const [activeTool, setActiveTool] = useState<ToolMeta | null>(null);

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex h-14 items-center px-4 text-[15px] font-medium">Tools Hub</div>
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
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {activeTool ? <ToolView key={activeTool.id} tool={activeTool} /> : <EmptyState />}
      </main>
    </div>
  );
}

function SidebarItem({ tool, active, onSelect }: { tool: ToolMeta; active: boolean; onSelect: () => void }) {
  const { t } = useTranslation(TOOLS_NS);
  const Icon = tool.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-subtle-foreground transition-colors duration-150",
        "hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active && "bg-accent text-foreground shadow-[inset_0_0_0_1px_var(--border)]",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      <span className="truncate">{t(`${tool.id}.name`)}</span>
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
      <Suspense fallback={null}>
        <Component />
      </Suspense>
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
