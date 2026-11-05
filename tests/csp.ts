// Sources that can never reach the network: the app's own bundle, inline data, and Tauri's local IPC/asset protocols.
const LOCAL_SOURCES = new Set([
  "'self'",
  "'none'",
  "'unsafe-inline'",
  "data:",
  "blob:",
  "ipc:",
  "http://ipc.localhost",
  "asset:",
  "http://asset.localhost",
]);

const REQUIRED_DIRECTIVES = ["default-src", "connect-src"];

/** Returns one problem per violation of ADR-0001 in a CSP string; an empty list means it conforms. */
export function checkCsp(csp: unknown): string[] {
  if (typeof csp !== "string" || !csp.trim()) return ["app.security.csp must be a non-empty string"];

  const directives = new Map(
    csp
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((tokens) => tokens[0])
      .map(([name, ...sources]) => [name!.toLowerCase(), sources] as const),
  );

  const problems = REQUIRED_DIRECTIVES.filter((name) => !directives.has(name)).map(
    (name) => `CSP must set ${name}, otherwise it falls back to allowing more than intended`,
  );
  for (const [name, sources] of directives) {
    for (const source of sources) {
      if (source === "'unsafe-eval'") problems.push(`${name}: 'unsafe-eval' is not allowed`);
      else if (source.startsWith("'nonce-") || source.startsWith("'sha")) continue;
      else if (!LOCAL_SOURCES.has(source)) problems.push(`${name}: "${source}" may load from the network`);
    }
  }
  return problems;
}
