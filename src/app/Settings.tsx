import { Fragment, useEffect, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Kbd } from "@/components/kbd";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreference } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/lib/preferences-context";
import type { Locale } from "@/lib/tool";
import type { AvailableUpdate, Platform, Updater } from "@/platform/types";
import { LANGUAGES, THEMES, type Language, type Theme } from "./app-preferences";
import type { GlobalHotkey } from "./desktop";
import { acceleratorFromEvent, hotkeyKeys } from "./hotkey";

/** Language names are written in their own language, so they read the same whatever the UI language is. */
const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", vi: "Tiếng Việt" };

type Done = "reset" | "cleared" | "upToDate" | null;

interface SettingsProps {
  platform: Platform;
  globalHotkey: GlobalHotkey;
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

function SettingsBody({ platform, globalHotkey, onDone: setDone }: SettingsProps & { onDone: (done: Done) => void }) {
  const { t } = useTranslation();
  const preferences = usePreferences();
  const [language, setLanguage] = usePreference<Language>("language");
  const [theme, setTheme] = usePreference<Theme>("theme");
  const [pasteDetection, setPasteDetection] = usePreference<boolean>("pasteDetection");
  const [quitOnClose, setQuitOnClose] = usePreference<boolean>("quitOnClose");
  const [autostart, setAutostart] = usePreference<boolean>("autostart");
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

      <Section title={t("settings.system")}>
        <Row
          label={t("settings.hotkey.label")}
          description={t("settings.hotkey.description")}
          error={globalHotkey.failed && t("settings.hotkey.taken", { hotkey: globalHotkey.failed })}
        >
          {(labelId) => (
            <HotkeyRecorder labelId={labelId} value={globalHotkey.hotkey} isMac={platform.isMac} onChange={globalHotkey.change} />
          )}
        </Row>
        <Row label={t("settings.quitOnClose.label")} description={t("settings.quitOnClose.description")}>
          {(labelId) => <Switch aria-labelledby={labelId} checked={quitOnClose} onCheckedChange={setQuitOnClose} />}
        </Row>
        <Row label={t("settings.autostart.label")} description={t("settings.autostart.description")}>
          {(labelId) => <Switch aria-labelledby={labelId} checked={autostart} onCheckedChange={setAutostart} />}
        </Row>
      </Section>

      <Section title={t("settings.update.title")}>
        <UpdateCheck updater={platform.updater} onDone={setDone} />
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
  error,
  stacked = false,
  children,
}: {
  label: string;
  description?: string;
  /** Shown under the description and announced, e.g. a combination the OS refused. */
  error?: string | null;
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
        {error !== undefined && (
          <span role="alert" className="text-[13px] text-destructive empty:hidden">
            {error}
          </span>
        )}
      </div>
      <div className={cn("min-w-0", !stacked && "sm:justify-self-end")}>{children(id)}</div>
    </div>
  );
}

type UpdateStep =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "checkFailed"; message: string }
  | { kind: "available"; update: AvailableUpdate }
  | { kind: "installing"; update: AvailableUpdate }
  | { kind: "installFailed"; update: AvailableUpdate; message: string };

/**
 * The running version and a button to check for a newer one. Nothing is checked until the button is pressed
 * (ADR-0001); a found update shows its changelog and is installed only if the user chooses to.
 */
function UpdateCheck({ updater, onDone }: { updater: Updater; onDone: (done: Done) => void }) {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const [step, setStep] = useState<UpdateStep>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    updater.currentVersion().then(
      (current) => !cancelled && setVersion(current),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [updater]);

  async function check() {
    setStep({ kind: "checking" });
    onDone(null);
    try {
      const update = await updater.check();
      setStep(update ? { kind: "available", update } : { kind: "idle" });
      if (!update) onDone("upToDate");
    } catch (error) {
      setStep({ kind: "checkFailed", message: errorMessage(error) });
    }
  }

  async function install(update: AvailableUpdate) {
    setStep({ kind: "installing", update });
    try {
      // On success the app restarts, so there is nothing to show afterwards.
      await updater.install();
    } catch (error) {
      setStep({ kind: "installFailed", update, message: errorMessage(error) });
    }
  }

  // Undefined, not null, without an error: the row then renders no alert at all; role="alert" is announced as it appears.
  const error =
    step.kind === "checkFailed"
      ? t("settings.update.checkFailed", { message: step.message })
      : step.kind === "installFailed"
        ? t("settings.update.installFailed", { message: step.message })
        : undefined;
  const update = "update" in step ? step.update : null;
  const busy = step.kind === "checking" || step.kind === "installing";

  return (
    <>
      <Row
        label={t("settings.update.label", { version }).trim()}
        description={t("settings.update.description")}
        error={error}
      >
        {() => (
          <Button variant="outline" size="sm" disabled={busy} onClick={check}>
            {step.kind === "checking" ? t("settings.update.checking") : t("settings.update.check")}
          </Button>
        )}
      </Row>
      {update && (
        <Row stacked label={t("settings.update.available", { version: update.version })}>
          {(labelId) => (
            <div className="flex flex-col items-start gap-3">
              <section
                aria-labelledby={labelId}
                className="max-h-48 w-full overflow-y-auto rounded-md bg-muted px-2.5 py-1.5 text-[13px] whitespace-pre-wrap text-subtle-foreground select-text"
              >
                {update.notes?.trim() || t("settings.update.noNotes")}
              </section>
              <Button size="sm" disabled={busy} onClick={() => install(update)}>
                {step.kind === "installing" ? t("settings.update.installing") : t("settings.update.install")}
              </Button>
            </div>
          )}
        </Row>
      )}
    </>
  );
}

/** Tauri commands reject with the Rust error's text; anything else with an Error. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Shows the global hotkey; click it, then press a new combination. Esc cancels. While recording, keys go nowhere
 * else, so Ctrl+K or Esc do not also open the palette or close Settings.
 */
function HotkeyRecorder({
  labelId,
  value,
  isMac,
  onChange,
}: {
  labelId: string;
  value: string;
  isMac: boolean;
  onChange: (accelerator: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [recording, setRecording] = useState(false);
  return (
    <Button
      id={id}
      variant="outline"
      size="sm"
      aria-labelledby={`${labelId} ${id}`}
      className="min-w-48 gap-1"
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(event) => {
        if (!recording) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") return setRecording(false);
        const accelerator = acceleratorFromEvent(event.nativeEvent);
        if (!accelerator) return;
        setRecording(false);
        onChange(accelerator);
      }}
    >
      {recording ? (
        <span className="text-muted-foreground">{t("settings.hotkey.recording")}</span>
      ) : (
        hotkeyKeys(value, isMac).map((key, index) => <Kbd key={index}>{key}</Kbd>)
      )}
    </Button>
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
