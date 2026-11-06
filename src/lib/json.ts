import { position, type Position } from "./position";

/** A JSON value, or where the text is not valid JSON, if the engine can tell. */
export type JsonResult = { ok: true; value: unknown } | { ok: false; at?: Position };

/** Reads JSON; a byte order mark at the start, as some editors save, is not part of it. */
export function readJson(text: string): JsonResult {
  const bom = text.startsWith("\uFEFF") ? 1 : 0;
  try {
    return { ok: true, value: JSON.parse(text.slice(bom)) };
  } catch (error) {
    // V8 (WebView2, Node) says where; other engines may not, and then the error has no position.
    const offset = /at position (\d+)/.exec((error as Error).message)?.[1];
    return offset === undefined ? { ok: false } : { ok: false, at: position(text, Number(offset) + bom) };
  }
}
