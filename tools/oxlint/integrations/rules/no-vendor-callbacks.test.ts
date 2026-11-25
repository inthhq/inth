import { RuleTester } from "vite-plus/lint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { noVendorCallbacksRule } from "./no-vendor-callbacks.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const vendorFile = "packages/sdk/integrations/src/vendors/analytics/example.ts";
const tester = new RuleTester({
  filename: vendorFile,
  languageOptions: { parserOptions: { lang: "ts" } },
});

tester.run("no-vendor-callbacks", noVendorCallbacksRule, {
  invalid: [
    {
      code: `export const example = () => ({ id: 'example', onLoad() {} });`,
      errors: [{ message: /`onLoad` on a vendor script/u }],
      name: "a method on a script literal",
    },
    {
      code: `
        const update = () => {};
        export const example = () => ({
          id: 'example',
          onBeforeLoad: update,
          onConsentChange: update,
          onDispose: () => {},
        });
      `,
      errors: [
        {
          line: 5,
          message: /`onBeforeLoad`, `onConsentChange`, `onDispose` on/u,
        },
      ],
      name: "one report per script literal, at its first callback",
    },
    {
      code: `export const example = (script) => ({ ...script, validate: () => {} });`,
      errors: 1,
      name: "validate",
    },
    {
      code: `export const example = (onError) => ({ onError });`,
      errors: 1,
      name: "a shorthand property",
    },
    {
      code: `
        export const example = (resolved) => {
          const manifestOnLoad = resolved.onLoad;
          resolved.onLoad = (info) => manifestOnLoad?.(info);
          resolved.serverStart = (info, started) =>
            started.onLoad === manifestOnLoad
              ? { ...started, onLoad: manifestOnLoad }
              : started;
          return resolved;
        };
      `,
      errors: [{ line: 4, message: /`onLoad`, `serverStart` on/u }],
      name: "wrapping a resolved script's callbacks is one site",
    },
    {
      code: `
        export const first = (script) => { script.onDispose = () => {}; };
        export const second = (script) => { script.onDispose = () => {}; };
      `,
      errors: 2,
      name: "assignments in different functions are different sites",
    },
    {
      code: `export const example = (script) => { script['onLoad'] = () => {}; };`,
      errors: 1,
      name: "a computed string member",
    },
    {
      code: `export const example = { onConsentChange: (info) => info };`,
      errors: 1,
      name: "a callback with a manifest field's name",
    },
    {
      code: `export const example = () => ({ onLoad() {} });`,
      errors: 1,
      filename:
        "packages/sdk/integrations/src/vendors/analytics/adapters-like.ts",
      name: "a file named like adapters is not in an adapters directory",
    },
  ],
  valid: [
    {
      code: `export const manifest = { onConsentChange: [{ type: 'callGlobal', global: 'gtag' }] };`,
      name: "a manifest step list",
    },
    {
      code: `
        const steps = [{ type: 'callGlobal', global: 'gtag' }] as const;
        export const manifest = { onConsentChange: steps } satisfies object;
      `,
      name: "a step list from a const",
    },
    {
      code: `export const manifest = { onLoadGranted: [], onConsentGranted: [], onBeforeLoadDenied: [] };`,
      name: "other manifest step lists",
    },
    {
      code: `export const example = (base) => ({ ...base, onLoad: undefined, onDispose: null });`,
      name: "clearing a callback",
    },
    {
      code: `export const example = (script, info) => { script.onLoad?.(info); const { onDispose } = script; return onDispose; };`,
      name: "calling or reading a callback",
    },
    {
      code: `export interface Options { onError?: (error: Error) => void }`,
      name: "a type member",
    },
    {
      code: `export const example = () => ({ onLoad() {} });`,
      filename: "packages/sdk/integrations/src/vendors/adapters/sentry.ts",
      name: "an adapter module",
    },
  ],
});
