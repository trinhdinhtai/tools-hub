import "@testing-library/jest-dom/vitest";

// jsdom does no layout, and has no geometry on text ranges; CodeMirror measures with them.
if (typeof Range !== "undefined") {
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= () => new DOMRect();
}
