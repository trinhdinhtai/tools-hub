/**
 * Pure URL logic for the URL Encoder: percent-encoding of whole URLs and single components, and splitting a URL into
 * editable parts that reassemble faithfully. No DOM, no store (ADR-0003).
 */

/** "full" encodes a whole URL, keeping its structure characters; "component" encodes one piece at a time. */
export type Scope = "full" | "component";

export type EncodeErrorReason = "lone-surrogate";

export class EncodeError extends Error {
  constructor(readonly reason: EncodeErrorReason) {
    super(`Cannot encode: ${reason}`);
    this.name = "EncodeError";
  }
}

/**
 * Percent-encodes text: `full` keeps `://?#&=` and the other URL structure characters; `component` encodes every
 * reserved character, for one piece (a param value, a path segment) at a time. Both read the text as UTF-8, so
 * Vietnamese and other non-ASCII text becomes percent escapes.
 */
export function encodeText(text: string, scope: Scope): string {
  try {
    return scope === "component" ? encodeURIComponent(text) : encodeURI(text);
  } catch {
    // encodeURI and encodeURIComponent only throw for a lone surrogate, e.g. text built from a raw "\ud800".
    throw new EncodeError("lone-surrogate");
  }
}

export type DecodeErrorReason = "invalid-escape";

export class DecodeError extends Error {
  constructor(readonly reason: DecodeErrorReason) {
    super(`Cannot decode: ${reason}`);
    this.name = "DecodeError";
  }
}

/** The reverse of `encodeText`; throws on an escape that is truncated (`%A`), malformed (`%zz`) or a lone surrogate. */
export function decodeText(text: string, scope: Scope): string {
  try {
    return scope === "component" ? decodeURIComponent(text) : decodeURI(text);
  } catch {
    throw new DecodeError("invalid-escape");
  }
}

export interface QueryParam {
  /** The decoded name and value, as shown to and edited by the user. */
  name: string;
  value: string;
  /** The pair exactly as written in the URL; kept byte-for-byte until the user edits the pair. */
  raw: string;
}

export interface UrlParts {
  scheme: string;
  host: string;
  port: string;
  path: string;
  params: QueryParam[];
  fragment: string;
}

export type SplitErrorReason = "not-a-url" | "missing-host";

export class SplitError extends Error {
  constructor(readonly reason: SplitErrorReason) {
    super(`Cannot split: ${reason}`);
    this.name = "SplitError";
  }
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const PORT = /^\d*$/;

/** Percent-decodes one query-param name or value. `+` reads as a space (form encoding); an invalid escape stays as written. */
export function decodeParam(text: string): string {
  try {
    return decodeURIComponent(text.replaceAll("+", "%20"));
  } catch {
    return text;
  }
}

/** One `name=value` pair, percent-encoded for use in a query string. */
export function encodeParam(name: string, value: string): string {
  return `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
}

function parseParams(query: string): QueryParam[] {
  if (query === "") return [];
  return query.split("&").map((pair) => {
    const eq = pair.indexOf("=");
    return {
      name: decodeParam(eq === -1 ? pair : pair.slice(0, eq)),
      value: eq === -1 ? "" : decodeParam(pair.slice(eq + 1)),
      raw: pair,
    };
  });
}

/** Splits `host:port`, tolerating userinfo (`user:pass@host`) and IPv6 literals (`[::1]:8080`). A port that is not all digits stays in the host. */
function splitAuthority(authority: string): { host: string; port: string } {
  const bracketClose = authority.indexOf("]");
  if (authority.includes("[") && bracketClose === -1) return { host: authority, port: "" };
  const colon = bracketClose === -1 ? authority.lastIndexOf(":") : authority.indexOf(":", bracketClose);
  if (colon === -1) return { host: authority, port: "" };
  const port = authority.slice(colon + 1);
  // A port that is not all digits, and a bare trailing colon, stay in the host so reassembling is byte-for-byte.
  if (port === "" || !PORT.test(port)) return { host: authority, port: "" };
  return { host: authority.slice(0, colon), port };
}

/**
 * Splits a URL of the shape `scheme://host[:port]/path?name=value&…#fragment` into its parts. The scheme, host, path
 * and fragment come back exactly as written; each param also keeps its written `raw` pair so that reassembling
 * without edits is byte-for-byte. Surrounding whitespace is ignored.
 */
export function splitUrl(text: string): UrlParts {
  const trimmed = text.trim();
  const schemeMatch = SCHEME.exec(trimmed);
  if (!schemeMatch) throw new SplitError("not-a-url");
  const scheme = trimmed.slice(0, schemeMatch[0].length - "://".length);
  const rest = trimmed.slice(schemeMatch[0].length);

  const fragmentAt = rest.indexOf("#");
  const beforeFragment = fragmentAt === -1 ? rest : rest.slice(0, fragmentAt);
  const fragment = fragmentAt === -1 ? "" : rest.slice(fragmentAt + 1);

  const queryAt = beforeFragment.indexOf("?");
  const authorityAndPath = queryAt === -1 ? beforeFragment : beforeFragment.slice(0, queryAt);
  const query = queryAt === -1 ? "" : beforeFragment.slice(queryAt + 1);

  const pathAt = authorityAndPath.indexOf("/");
  const authority = pathAt === -1 ? authorityAndPath : authorityAndPath.slice(0, pathAt);
  const path = pathAt === -1 ? "" : authorityAndPath.slice(pathAt);

  const { host, port } = splitAuthority(authority);
  if (host === "") throw new SplitError("missing-host");

  return { scheme, host, port, path, params: parseParams(query), fragment };
}

/**
 * Reassembles the parts into a URL, the inverse of `splitUrl`. A path that the user typed without its leading `/`
 * gets one, so it cannot slide into the host. Untouched params keep their written `raw` pairs; an empty query adds
 * no `?`, an empty fragment no `#`.
 */
export function buildUrl(parts: UrlParts): string {
  const path = parts.path === "" || parts.path.startsWith("/") ? parts.path : `/${parts.path}`;
  const query = parts.params.map((param) => param.raw).join("&");
  const fragment = parts.fragment === "" ? "" : `#${parts.fragment}`;
  const port = parts.port === "" ? "" : `:${parts.port}`;
  return `${parts.scheme}://${parts.host}${port}${path}${query === "" ? "" : `?${query}`}${fragment}`;
}

const GENERIC_URL = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;

/**
 * Scores how likely a pasted text is a URL: 1 for an http(s) URL that splits cleanly, 0.9 for any other scheme,
 * 0 for anything else.
 */
export function detectPaste(text: string): number {
  const trimmed = text.trim();
  if (!GENERIC_URL.test(trimmed)) return 0;
  try {
    splitUrl(trimmed);
  } catch {
    return 0;
  }
  return /^https?:/i.test(trimmed) ? 1 : 0.9;
}
