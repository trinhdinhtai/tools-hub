import { Fragment, useEffect, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreference } from "@/lib/preferences";
import { cn } from "@/lib/utils";
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
        className="flex max-h-[min(720px,calc(100vh-4rem))] flex-col gap-4 sm:max-w-2xl"
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
      <div className="no-scrollbar scroll-fade -mx-4 min-h-0 flex-1 overflow-y-auto px-4">
        <SettingsBody {...props} onDone={setDone} />
      </div>
      <DialogFooter className="items-center sm:justify-between">
        <p role="status" className="text-[13px] text-subtle-foreground">
          {done && t(`settings.done.${done}`)}
        </p>
        <DialogClose render={<Button size="sm" />}>{t("settings.finish")}</DialogClose>
      </DialogFooter>
    </>
  );
}

function SettingsBody({ platform, onDone: setDone }: SettingsProps & { onDone: (done: Done) => void }) {
  const { t } = useTranslation();
  const preferences = usePreferences();
  const [language, setLanguage] = usePreference<Language>("language");
  const [theme, setTheme] = usePreference<Theme>("theme");
  const [pasteDetection, setPasteDetection] = usePreference<boolean>("pasteDetection");
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

      <Section title={t("settings.behavior")}>
        <Row label={t("settings.pasteDetection.label")} description={t("settings.pasteDetection.description")}>
          {(labelId) => <Switch aria-labelledby={labelId} checked={pasteDetection} onCheckedChange={setPasteDetection} />}
        </Row>
      </Section>

      <Section title={t("settings.data")}>
        <Row stacked label={t("settings.storage.label")} description={t("settings.storage.description")}>
          {(labelId) => (
            <p
              aria-labelledby={labelId}
              className="rounded-md bg-muted px-2.5 py-1.5 font-mono text-[13px] text-subtle-foreground select-text [overflow-wrap:anywhere]"
            >
              {storePath === "" ? t("settings.storage.unknown") : <PathText path={storePath ?? ""} />}
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

/**
 * A labelled setting. The control sits on the right, capped at half the row so a long value never squeezes the label;
 * `stacked` puts it under the label at full width, for values to read rather than controls (a file path).
 */
function Row({
  label,
  description,
  stacked = false,
  children,
}: {
  label: string;
  description?: string;
  stacked?: boolean;
  children: (labelId: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "grid gap-3 px-4 py-3",
        !stacked && "sm:grid-cols-[minmax(0,1fr)_fit-content(50%)] sm:items-center sm:gap-6",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span id={id} className="font-medium">
          {label}
        </span>
        {description && <span className="text-[13px] text-subtle-foreground">{description}</span>}
      </div>
      <div className={cn("min-w-0", !stacked && "sm:justify-self-end")}>{children(id)}</div>
    </div>
  );
}

/** A file path that wraps after its separators (`\` or `/`) rather than inside a folder name. */
function PathText({ path }: { path: string }) {
  return path.split(/(?<=[\\/])/).map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <wbr />}
      {part}
    </Fragment>
  ));
}

/**
 * A single choice among a few fixed options, shown as a select labelled by its row.
 *
 * Picking a Language or Theme re-renders the whole app, so the choice is applied only once the list has finished
 * closing; otherwise the closing list shows a frame in the new colours or language. The trigger shows the pick at once.
 */
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
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<T | null>(null);
  // `items` lets the trigger show an option's label rather than its value.
  const items = options.map((option) => ({ value: option, label: label(option) }));
  return (
    <Select
      items={items}
      value={picked ?? value}
      open={open}
      onOpenChange={setOpen}
      onValueChange={(next) => {
        if (next === null) return;
        if (open) setPicked(next);
        else onChange(next);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen || picked === null) return;
        onChange(picked);
        setPicked(null);
      }}
    >
      <SelectTrigger size="sm" aria-labelledby={labelId} className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
