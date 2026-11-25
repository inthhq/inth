import { eslintCompatPlugin } from "vite-plus/lint/plugins";

import { fixedScriptHostRule } from "./rules/fixed-script-host.ts";
import { noUrlOptionsRule } from "./rules/no-url-options.ts";
import { noVendorCallbacksRule } from "./rules/no-vendor-callbacks.ts";

/** Rules that keep `@inth/integrations` vendor files sendable as JSON manifests. */
const integrationsPlugin = eslintCompatPlugin({
  meta: { name: "integrations" },
  rules: {
    "fixed-script-host": fixedScriptHostRule,
    "no-url-options": noUrlOptionsRule,
    "no-vendor-callbacks": noVendorCallbacksRule,
  },
});

export default integrationsPlugin;
