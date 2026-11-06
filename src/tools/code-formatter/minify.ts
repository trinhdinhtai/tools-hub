/** JavaScript as short as terser makes it; top-level names stay, since other code may use them. */
export async function minifyJavaScript(text: string, module = false): Promise<string> {
  const { minify } = await import("terser");
  const { code } = await minify(text, { module, toplevel: false });
  return code ?? "";
}

/** CSS as short as csso makes it, without comments other than the `/*! … *\/` kept for licences. */
export async function minifyCss(text: string): Promise<string> {
  const { minify } = await import("csso");
  return minify(text).css;
}
