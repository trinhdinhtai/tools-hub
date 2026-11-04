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
    {
      filename: "C:\\repo\\src\\tools\\url-encoder\\logic.ts",
      code: 'import { encode } from "../base64/logic";',
      errors: [{ messageId: "crossTool" }],
    },
  ],
});
