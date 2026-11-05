import { useEffect, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreference } from "@/lib/preferences";
import { usePreferences } from "@/lib/preferences-context";
import type { Locale } from "@/lib/tool";
import type { Platform } from "@/platform/types";
import { LANGUAGES, THEMES, type Language, type Theme } from "./app-preferences";

/** Language names are written in their own language, so they read the same whatever the UI language is. */
const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", vi: "Tiếng Việt" };

type Done = "reset" | "cleared" | null;

interface SettingsProps {
  platform: Platform;
}

/** Settings open over whatever is on screen, so the open Tool and its Input stay as they are. */
export function SettingsDialog({
  open,
  onOpenChange,
  ...props
}: SettingsProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t("settings.close")}
        aria-describedby={undefined}
        className="flex max-h-[min(720px,calc(100vh-4rem))] flex-col gap-6 sm:max-w-2xl"
      >
        <SettingsPanel {...props} />
      </DialogContent>
    </Dialog>
  );
}

/** Lives inside the dialog content, so its state (the last confirmation) is fresh each time the dialog opens. */
function SettingsPanel(props: SettingsProps) {
  const { t } = useTranslation();
  const [done, setDone] = useState<Done>(null);
  return (
    <>
      {/* Header and footer stay put; only the body scrolls (shadcn "Scrollable Content", "Sticky Footer"). */}
      <DialogHeader>
        <DialogTitle className="text-xl font-medium">{t("settings.title")}</DialogTitle>
      </DialogHeader>
      <div className="no-scrollbar scroll-fade -mx-6 min-h-0 flex-1 overflow-y-auto px-6">
        <SettingsBody {...props} onDone={setDone} />
      </div>
      <DialogFooter className="items-center sm:justify-between">
        <p role="status" className="text-[13px] text-subtle-foreground">
          {done && t(`settings.done.${done}`)}
        </p>
        <DialogClose asChild>
          <Button size="sm">{t("settings.finish")}</Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}

function SettingsBody({ platform, onDone: setDone }: SettingsProps & { onDone: (done: Done) => void }) {
  const { t } = useTranslation();
  const preferences = usePreferences();
  const [language, setLanguage] = usePreference<Language>("language");
  const [theme, setTheme] = usePreference<Theme>("theme");
  const [storePath, setStorePath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    platform.store.path().then(
      (path) => !cancelled && setStorePath(path),
      () => !cancelled && setStorePath(""),
    );
    return () => {
      cancelled = true;
    };
  }, [platform]);

  return (
    <div className="flex flex-col gap-6">
      <Section title={t("settings.appearance")}>
        <Row label={t("settings.language.label")} description={t("settings.language.description")}>
          {(labelId) => (
            <Choice
              labelId={labelId}
              value={language}
              options={LANGUAGES}
              onChange={setLanguage}
              label={(option) =>
                option === "system"
                  ? t("settings.language.system")
                  : LANGUAGE_NAMES[option]
              }
            />
          )}
        </Row>
        <Row label={t("settings.theme.label")}>
          {(labelId) => (
            <Choice labelId={labelId} value={theme} options={THEMES} onChange={setTheme} label={(option) => t(`settings.theme.${option}`)} />
          )}
        </Row>
      </Section>

      <Section title={t("settings.data")}>
        <Row label={t("settings.storage.label")} description={t("settings.storage.description")}>
          {(labelId) => (
            <p aria-labelledby={labelId} className="font-mono text-[13px] break-all text-subtle-foreground select-text">
              {storePath === "" ? t("settings.storage.unknown") : storePath}
            </p>
          )}
        </Row>
        <Row label={t("settings.recent.label")} description={t("settings.recent.description")}>
          {() => (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await preferences.clearRecent();
                setDone("cleared");
              }}
            >
              {t("settings.recent.clear")}
            </Button>
          )}
        </Row>
        <Row label={t("settings.reset.label")} description={t("settings.reset.description")}>
          {() => (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await preferences.resetAll();
                setDone("reset");
              }}
            >
              {t("settings.reset.action")}
            </Button>
          )}
        </Row>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h2 id={id} className="pb-2 text-xs text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y rounded-lg border bg-card">{children}</div>
    </section>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: (labelId: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="flex flex-col gap-0.5">
        <span id={id} className="font-medium">
          {label}
        </span>
        {description && <span className="text-[13px] text-subtle-foreground">{description}</span>}
      </div>
      <div className="min-w-0 sm:justify-self-end">{children(id)}</div>
    </div>
  );
}

/** A single choice among a few fixed options, shown as a select labelled by its row. */
function Choice<T extends string>({
  labelId,
  value,
  options,
  onChange,
  label,
}: {
  labelId: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  label: (option: T) => string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger size="sm" aria-labelledby={labelId} className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {label(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
