import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// `findBy…` and `waitFor` give up after 1 s by default, which a busy CI runner sometimes needs more than to render a
// Tool. They still return as soon as the element shows, so a wait of 3 s slows nothing down; it stays well under the
// test timeout in `vite.config.ts`.
configure({ asyncUtilTimeout: 3000 });

// jsdom does no layout, and has no geometry on text ranges; CodeMirror measures with them.
if (typeof Range !== "undefined") {
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
}
