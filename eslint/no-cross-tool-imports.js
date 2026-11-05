// ADR-0005: a Tool imports only from shared code (lib/, components/, platform/, i18n/), never from another Tool's folder.
import path from "node:path";

const TOOL_FILE = /^(.*\/src)\/tools\/([^/]+)\//;
const TOOL_TARGET = /\/src\/tools\/([^/]+)(\/|$)/;
const APP_SHELL_TARGET = /\/src\/app(\/|$)/;

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "Disallow a Tool importing from another Tool's folder (ADR-0005)" },
    schema: [],
    messages: {
      crossTool:
        'Tool "{{from}}" must not import from Tool "{{to}}". Move shared code to src/lib/ once a second Tool needs it (ADR-0005).',
      appShell:
        'Tool "{{from}}" must not import from the app shell (src/app/). Tools may use only lib/, components/, platform/ and i18n/ (ADR-0005).',
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
      const target = resolve(source.value);
      if (!target) return;
      const targetTool = TOOL_TARGET.exec(target)?.[1];
      if (targetTool && targetTool !== ownTool) {
        context.report({ node: source, messageId: "crossTool", data: { from: ownTool, to: targetTool } });
      } else if (APP_SHELL_TARGET.test(target)) {
        context.report({ node: source, messageId: "appShell", data: { from: ownTool } });
      }
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};
