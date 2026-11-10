/** What a hidden value is. Its placeholder is named after it: `api-key` gives `[API_KEY_1]`. */
export type SecretKind =
  | "private-key"
  | "jwt"
  | "aws-key"
  | "github-token"
  | "stripe-key"
  | "api-key"
  | "password"
  | "secret"
  | "email"
  | "id-number"
  | "card"
  | "phone"
  | "ip";

/** A value hidden from the text, and the placeholder that stands in for it. */
export interface Redaction {
  placeholder: string;
  value: string;
  kind: SecretKind;
}

export type RedactResult = { ok: true; text: string; redactions: Redaction[] } | { ok: false; reason: "too-large" };

/** Longest text scanned, in UTF-16 units. */
export const MAX_LENGTH = 5_000_000;

export interface RestoreResult {
  text: string;
  /** Placeholders put back. */
  restored: number;
  /** Placeholders in the text, as written there, that no redaction made; each once. */
  unknown: string[];
}

interface Detector {
  kind: SecretKind;
  pattern: RegExp;
  /** Keeps only the matches that really are such a value, e.g. card numbers that pass the Luhn check. */
  accept?: (value: string) => boolean;
}

const labelOf = (kind: SecretKind) => kind.toUpperCase().replaceAll("-", "_");

/** Whether the digits of `value` pass the Luhn check, as every payment card number does. */
function passesLuhn(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Values that say what a key holds rather than hold it: types, empty values, references to the environment. */
const NOT_A_VALUE = new Set(["string", "number", "boolean", "null", "undefined", "none", "nil", "true", "false", "any", "unknown"]);
const REFERENCE = /^(?:process\.env|import\.meta\.env|os\.environ|env\(|\$\{|\$[A-Z_])/i;
const isAValue = (value: string) => !NOT_A_VALUE.has(value.toLowerCase()) && !REFERENCE.test(value);

/**
 * The value assigned to a key named like `key` in config, env files, JSON, YAML or code (`key=value`,
 * `"key": "value"`, `key: 'value'`): the whole of a quoted value, or an unquoted one up to a space, quote or separator.
 */
function assignedValue(key: string): RegExp {
  const before = `\\b${key}["']?[ \\t]*[:=][ \\t]*`;
  return new RegExp(
    `(?<=${before}")[^"\\n]+(?=")|(?<=${before}')[^'\\n]+(?=')|(?<=${before})(?!["'])[^\\s"',;]+`,
    "gi",
  );
}

/** A placeholder made by `redact`, e.g. `[EMAIL_1]`. */
const PLACEHOLDER = /\[[A-Z_]+_\d+\]/;

/** A placeholder as an AI may write it back: in any case, with spaces inside the brackets (`[ email_1 ]`). */
const WRITTEN_PLACEHOLDER = /\[\s*([A-Za-z]+(?:_[A-Za-z]+)*_\d+)\s*\]/g;
const normalized = (name: string) => `[${name.toUpperCase()}]`;

/** Brackets of a value hidden while detecting, in Unicode's private use area so no text or detector takes them up. */
const MARKER_START = String.fromCharCode(0xe000);
const MARKER_END = String.fromCharCode(0xe001);
const MARKER = new RegExp(`${MARKER_START}([0-9]+)${MARKER_END}`, "g");

/**
 * The detectors, run in this order on what the ones before left: a value inside a longer secret (an email in a private
 * key) goes with that secret.
 */
const DETECTORS: Detector[] = [
  {
    kind: "private-key",
    pattern:
      /-----BEGIN ([A-Z ]*)PRIVATE KEY-----[\s\S]*?-----END \1PRIVATE KEY-----|-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g,
  },
  { kind: "jwt", pattern: /\beyJ[\w-]+\.eyJ[\w-]+\.[\w-]*/g },
  { kind: "aws-key", pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  { kind: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_\w{22,255})\b/g },
  // Secret and restricted keys, and webhook signing secrets; publishable keys are public.
  { kind: "stripe-key", pattern: /\b(?:(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,247}|whsec_[A-Za-z0-9]{24,})\b/g },
  // OpenAI and Anthropic keys, Google API keys, Slack tokens.
  { kind: "api-key", pattern: /\bsk-(?:proj-|ant-[a-z0-9]+-)?[\w-]{20,}|\bAIza[\w-]{35}\b|\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  // The password of a URL such as postgres://user:password@host.
  { kind: "password", pattern: /(?<=\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+(?=@)/gi },
  { kind: "password", pattern: assignedValue("[\\w.-]*(?:password|passwd|pwd|mật[ _]?khẩu|mat_?khau)"), accept: isAValue },
  {
    kind: "secret",
    pattern: assignedValue("[\\w.-]*(?:secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credentials?)"),
    accept: isAValue,
  },
  { kind: "secret", pattern: /(?<=\bBearer[ \t]+)[\w.~+/-]+=*/g },
  { kind: "email", pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu },
  // A Vietnamese citizen ID (12 digits) or old ID card (9 digits), when the text names it as one.
  { kind: "id-number", pattern: /(?<=\b(?:CCCD|CMND|căn cước(?: công dân)?)[^\d\n]{0,12})\d{9}(?:\d{3})?(?!\d)/gi },
  // 13 to 19 digits, in groups or not, that pass the Luhn check.
  { kind: "card", pattern: /(?<![\w.])\d(?:[ -]?\d){12,18}(?![\w.]|\.\d)/g, accept: passesLuhn },
  // An international number (+84 912 345 678, +1 (415) 555-0132), or a Vietnamese mobile one (0912 345 678).
  {
    kind: "phone",
    pattern:
      /(?<![\w+])\+\d{1,3}[ .-]?(?:\(\d{1,4}\)[ .-]?)?\d{2,4}(?:[ .-]?\d{2,4}){1,4}(?!\d)|(?<![\w.])0[35789]\d{2}[ .-]?\d{3}[ .-]?\d{3}(?![\w]|\.\d)/g,
  },
  {
    kind: "ip",
    pattern: /(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\w]|\.\d)/g,
  },
];

/** Hides every secret and piece of personal data in `text` behind a placeholder; the same value gets the same one. */
export function redact(text: string): RedactResult {
  if (text.length > MAX_LENGTH) return { ok: false, reason: "too-large" };

  // Each detector leaves a marker where it hid a value; placeholders are numbered afterwards, in the order the values
  // appear in the text, not the order the detectors found them.
  const found: { value: string; kind: SecretKind }[] = [];
  const markerOf = new Map<string, string>();
  let out = text;
  for (const { kind, pattern, accept } of DETECTORS) {
    out = out.replace(pattern, (value) => {
      // Already hidden by a detector before, e.g. a GitHub token that is also the value of GITHUB_TOKEN=.
      if (value.includes(MARKER_START)) return value;
      if (accept && !accept(value)) return value;
      let marker = markerOf.get(value);
      if (marker === undefined) {
        marker = `${MARKER_START}${found.length}${MARKER_END}`;
        markerOf.set(value, marker);
        found.push({ value, kind });
      }
      return marker;
    });
  }

  // Placeholders the text holds already, however written, are never given out: restoring would take them for ours.
  const taken = new Set(Array.from(text.matchAll(WRITTEN_PLACEHOLDER), ([, name]) => normalized(name!)));
  const counts = new Map<SecretKind, number>();
  const nextPlaceholder = (kind: SecretKind) => {
    let placeholder: string;
    do {
      const n = (counts.get(kind) ?? 0) + 1;
      counts.set(kind, n);
      placeholder = `[${labelOf(kind)}_${n}]`;
    } while (taken.has(placeholder));
    return placeholder;
  };
  const redactions: Redaction[] = [];
  const byValue = new Map<string, Redaction>();
  out = out.replace(MARKER, (marker, index: string) => {
    // Not a marker of ours: the text itself held those private use characters.
    const hidden = found[Number(index)];
    if (!hidden) return marker;
    let redaction = byValue.get(hidden.value);
    if (!redaction) {
      redaction = { placeholder: nextPlaceholder(hidden.kind), ...hidden };
      byValue.set(hidden.value, redaction);
      redactions.push(redaction);
    }
    return redaction.placeholder;
  });
  return { ok: true, text: out, redactions };
}

/**
 * Puts the original values back in place of the placeholders `redactions` made, also where an AI wrote one in other
 * case or with spaces inside its brackets.
 */
export function restore(text: string, redactions: Redaction[]): RestoreResult {
  const byPlaceholder = new Map(redactions.map((r) => [r.placeholder, r.value]));
  let restored = 0;
  const unknown = new Set<string>();
  const out = text.replace(WRITTEN_PLACEHOLDER, (written, name: string) => {
    const value = byPlaceholder.get(normalized(name));
    if (value === undefined) {
      if (PLACEHOLDER.test(normalized(name))) unknown.add(written);
      return written;
    }
    restored++;
    return value;
  });
  return { text: out, restored, unknown: [...unknown] };
}
