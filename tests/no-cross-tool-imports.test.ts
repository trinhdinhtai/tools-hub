import { RuleTester } from "eslint";
import rule from "../eslint/no-cross-tool-imports.js";

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: "module" } });

const base64File = "/repo/src/tools/base64/Base64Tool.tsx";
const otherToolFile = "/repo/src/tools/url-encoder/logic.ts";

tester.run("no-cross-tool-imports", rule, {
  valid: [
    { filename: base64File, code: 'import { encode } from "./logic";' },
    { filename: base64File, code: 'import en from "./locales/en.json";' },
    { filename: base64File, code: 'import { cn } from "@/lib/utils";' },
    { filename: base64File, code: 'import { Label } from "../../components/ui/label";' },
    { filename: base64File, code: 'import { useTranslation } from "react-i18next";' },
    { filename: base64File, code: 'const ui = import("./Base64Tool");' },
    { filename: base64File, code: 'import { usePreference } from "@/lib/preferences";' },
    { filename: base64File, code: 'import { isMac } from "@/platform/os";' },
    // Code outside a Tool folder is not restricted by this rule.
    { filename: "/repo/src/app/App.tsx", code: 'import meta from "@/tools/base64/meta";' },
  ],
  invalid: [
    { filename: otherToolFile, code: 'import { encode } from "../base64/logic";', errors: [{ messageId: "crossTool" }] },
    { filename: otherToolFile, code: 'import { encode } from "@/tools/base64/logic";', errors: [{ messageId: "crossTool" }] },
    { filename: otherToolFile, code: 'export { encode } from "../base64/logic";', errors: [{ messageId: "crossTool" }] },
    { filename: otherToolFile, code: 'export * from "@/tools/base64";', errors: [{ messageId: "crossTool" }] },
    { filename: otherToolFile, code: 'const m = import("../base64/meta");', errors: [{ messageId: "crossTool" }] },
    { filename: otherToolFile, code: 'import { tools } from "@/app/registry";', errors: [{ messageId: "appShell" }] },
    { filename: otherToolFile, code: 'import { App } from "../../app/App";', errors: [{ messageId: "appShell" }] },
    // ADR-0004: a Tool cannot get hold of a store; it persists only through @/lib/preferences.
    { filename: otherToolFile, code: 'import { createTauriPlatform } from "@/platform/tauri";', errors: [{ messageId: "store" }] },
    { filename: otherToolFile, code: 'import { createMemoryPlatform } from "../../platform/memory";', errors: [{ messageId: "store" }] },
    { filename: otherToolFile, code: 'import { LazyStore } from "@tauri-apps/plugin-store";', errors: [{ messageId: "store" }] },
    { filename: otherToolFile, code: 'import { PreferencesContext } from "@/lib/preferences-context";', errors: [{ messageId: "store" }] },
    { filename: otherToolFile, code: 'localStorage.setItem("k", input);', errors: [{ messageId: "webStorage" }] },
    { filename: otherToolFile, code: 'window.sessionStorage.setItem("k", input);', errors: [{ messageId: "webStorage" }] },
    { filename: otherToolFile, code: 'indexedDB.open("db");', errors: [{ messageId: "webStorage" }] },
    {
      filename: "C:\\repo\\src\\tools\\url-encoder\\logic.ts",
      code: 'import { encode } from "../base64/logic";',
      errors: [{ messageId: "crossTool" }],
    },
  ],
});
