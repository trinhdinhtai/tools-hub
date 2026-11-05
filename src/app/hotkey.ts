/**
 * Global hotkeys are written as Tauri accelerators: modifiers in a fixed order, then the key by its position on the
 * keyboard (`event.code`), e.g. "Ctrl+Alt+Space". Letters and digits drop their `Key`/`Digit` prefix.
 */

const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;

/**
 * The combination a keydown makes, or null while it is not one yet (only modifiers held) or never can be: a key with
 * no modifier, or with Shift alone, would take ordinary typing away from every other app.
 */
export function acceleratorFromEvent(event: KeyboardEvent): string | null {
  const { code } = event;
  if (!code || MODIFIER_CODES.test(code)) return null;
  const modifiers = [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Super",
  ].filter((modifier): modifier is string => Boolean(modifier));
  if (modifiers.length === 0 || (modifiers.length === 1 && event.shiftKey)) return null;
  return [...modifiers, code.replace(/^(Key|Digit)(?=.$)/, "")].join("+");
}

const MAC_NAMES: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Super: "⌘" };
const ARROWS: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };

/** The keys of a combination as shown to the user, with the macOS symbols on a Mac. */
export function hotkeyKeys(accelerator: string, isMac: boolean): string[] {
  return accelerator
    .split("+")
    .map((key) => ARROWS[key] ?? (isMac ? (MAC_NAMES[key] ?? key) : key === "Super" ? "Win" : key));
}
