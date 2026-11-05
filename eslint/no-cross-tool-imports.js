// ADR-0005: a Tool imports only from shared code (lib/, components/, platform/, i18n/), never from another Tool's folder.
// ADR-0004: a Tool cannot get hold of a store (Platform constructors, tauri-plugin-store, Web Storage, IndexedDB);
// it persists only its declared Preference and Recent, through @/lib/preferences.
import path from "node:path";

const TOOL_FILE = /^(.*\/src)\/tools\/([^/]+)\//;
const TOOL_TARGET = /\/src\/tools\/([^/]+)(\/|$)/;
const APP_SHELL_TARGET = /\/src\/app(\/|$)/;
/** Modules that construct a Platform (and with it a store), or hand out the unscoped Preferences. */
const STORE_TARGET = /\/src\/(platform\/(tauri|memory)|lib\/preferences-context)(\.tsx?)?$/;
const STORE_PACKAGES = new Set(["@tauri-apps/plugin-store"]);
const WEB_STORAGE = new Set(["localStorage", "sessionStorage", "indexedDB"]);
const GLOBAL_OBJECTS = new Set(["window", "globalThis", "self"]);

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "Disallow a Tool importing from another Tool's folder (ADR-0005) or reaching a store (ADR-0004)" },
    schema: [],
    messages: {
      crossTool:
        'Tool "{{from}}" must not import from Tool "{{to}}". Move shared code to src/lib/ once a second Tool needs it (ADR-0005).',
      appShell:
        'Tool "{{from}}" must not import from the app shell (src/app/). Tools may use only lib/, components/, platform/ and i18n/ (ADR-0005).',
      store:
        'Tool "{{from}}" must not reach the store directly. Declare a Preference or Recent in meta.ts and use @/lib/preferences (ADR-0004).',
      webStorage:
        'Tool "{{from}}" must not use {{name}}: Input is never persisted. Declare a Preference or Recent in meta.ts and use @/lib/preferences (ADR-0004).',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    const match = TOOL_FILE.exec(filename);
    if (!match) return {};
    const [, srcRoot, ownTool] = match;

    function resolve(specifier) {
      if (specifier.startsWith("@/")) return `${srcRoot}/${specifier.slice(2)}`;
      if (specifier.startsWith(".")) return path.posix.join(path.posix.dirname(filename), specifier);
      return null;
    }

    function check(node) {
      const source = node.source;
      if (!source || source.type !== "Literal" || typeof source.value !== "string") return;
      if (STORE_PACKAGES.has(source.value)) {
        context.report({ node: source, messageId: "store", data: { from: ownTool } });
        return;
      }
      const target = resolve(source.value);
      if (!target) return;
      const targetTool = TOOL_TARGET.exec(target)?.[1];
      if (targetTool && targetTool !== ownTool) {
        context.report({ node: source, messageId: "crossTool", data: { from: ownTool, to: targetTool } });
      } else if (APP_SHELL_TARGET.test(target)) {
        context.report({ node: source, messageId: "appShell", data: { from: ownTool } });
      } else if (STORE_TARGET.test(target)) {
        context.report({ node: source, messageId: "store", data: { from: ownTool } });
      }
    }

    function reportWebStorage(node, name) {
      context.report({ node, messageId: "webStorage", data: { from: ownTool, name } });
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
      // `localStorage`, unless a local variable of that name shadows the global.
      Identifier(node) {
        if (!WEB_STORAGE.has(node.name)) return;
        const parent = node.parent;
        if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return;
        if (parent.type === "Property" && parent.key === node && !parent.computed) return;
        let scope = context.sourceCode.getScope(node);
        while (scope) {
          const variable = scope.set.get(node.name);
          if (variable && variable.defs.length > 0) return;
          scope = scope.upper;
        }
        reportWebStorage(node, node.name);
      },
      // `window.localStorage`, `globalThis.indexedDB`, …
      MemberExpression(node) {
        if (node.computed || node.property.type !== "Identifier" || !WEB_STORAGE.has(node.property.name)) return;
        if (node.object.type === "Identifier" && GLOBAL_OBJECTS.has(node.object.name)) reportWebStorage(node, node.property.name);
      },
    };
  },
};
