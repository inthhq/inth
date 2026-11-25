import { RuleTester } from "vite-plus/lint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { fixedScriptHostRule } from "./fixed-script-host.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  filename: "packages/sdk/integrations/src/vendors/analytics/example.ts",
  languageOptions: { parserOptions: { lang: "ts" } },
});

const notFixed = { messageId: "notFixed" };

tester.run("fixed-script-host", fixedScriptHostRule, {
  invalid: [
    {
      code: `export const m = { install: [{ src: '{{scriptUrl}}', type: 'loadScript' }] };`,
      errors: [notFixed],
      name: "a placeholder for the whole URL",
    },
    {
      code: `export const m = { install: [{ src: 'http://cdn.example.com/a.js', type: 'loadScript' }] };`,
      errors: [notFixed],
      name: "http",
    },
    {
      code: `export const m = { install: [{ src: '//cdn.example.com/a.js', type: 'loadScript' }] };`,
      errors: [notFixed],
      name: "a protocol-relative URL",
    },
    {
      code: `export const step = { id: 'replay', src: '{{replayUrl}}', type: 'loadScriptStep' };`,
      errors: [notFixed],
      name: "a loadScriptStep",
    },
    {
      code: `export const m = { install: [{ src: '{{scriptUrl}}' }] };`,
      errors: [notFixed],
      name: "an install entry without a type",
    },
    {
      code: `export const step = (url: string) => ({ src: url, type: 'loadScript' });`,
      errors: [notFixed],
      name: "a variable",
    },
    {
      code: `let url = 'https://cdn.example.com/a.js'; export const step = { src: url, type: 'loadScript' };`,
      errors: [notFixed],
      name: "a let binding",
    },
    {
      code: `export const step = (host: string) => ({ src: \`https://\${host}/a.js\`, type: 'loadScript' });`,
      errors: [notFixed],
      name: "a template expression in the host",
    },
    {
      code: `export const step = (sub: string) => ({ src: \`https://\${sub}.example.com/a.js\`, type: 'loadScript' });`,
      errors: [notFixed],
      name: "a template expression in part of the host",
    },
    {
      code: `export const m = { install: [{ src: 'https://{{trackerDomain}}/pd.js', type: 'loadScript' }] };`,
      errors: [
        {
          message: /^`\{\{trackerDomain\}\}` sets the script host/u,
        },
      ],
      name: "a host placeholder with no hostname option",
    },
    {
      code: `
        export const options = { trackerDomain: { kind: 'id', label: 'Tracker', pattern: '^a$', required: true } };
        export const m = { install: [{ src: 'https://{{trackerDomain}}/pd.js', type: 'loadScript' }] };
      `,
      errors: [{ messageId: "hostPlaceholder" }],
      name: "a host placeholder whose option is not a hostname",
    },
    {
      code: `export const m = { install: [{ src: 'https://user@cdn.example.com/a.js', type: 'loadScript' }] };`,
      errors: [notFixed],
      name: "credentials before the host",
    },
    {
      code: `export const m = { install: [{ src: 'https://', type: 'loadScript' }] };`,
      errors: [notFixed],
      name: "no host",
    },
  ],
  valid: [
    {
      code: `export const m = { install: [{ src: 'https://www.googletagmanager.com/gtm.js?id={{id}}{{layerQuery}}', type: 'loadScript' }] };`,
      name: "a literal host with placeholders after it",
    },
    {
      code: `export const step = (id: string) => ({ src: \`https://cdn.example.com/\${id}.js\`, type: 'loadScript' });`,
      name: "a template with a literal host",
    },
    {
      code: `
        const SRC = 'https://assets.onedollarstats.com/stonks.js' as const;
        export const m = { install: [{ src: SRC, type: 'loadScript' }] };
      `,
      name: "a const with a literal host",
    },
    {
      code: `export const step = { id: 'api-static', src: 'https://cdn.dynamicyield.com/api/{{section}}/api_static.js', type: 'loadScriptStep' };`,
      name: "a loadScriptStep with a literal host",
    },
    {
      code: `
        export const m = { install: [{ src: 'https://{{trackerDomain}}/pd.js', type: 'loadScript' }] };
        export const remote = defineRemote('pardot', {
          trackerDomain: { kind: 'hostname', label: 'Tracker domain', required: true },
        }, resolve);
      `,
      name: "a host placeholder declared as a hostname option",
    },
    {
      code: `export const m = { install: [{ src: 'https://cdn.example.com:8443/a.js', type: 'loadScript' }] };`,
      name: "a port",
    },
    {
      code: `export const result = { integrity: undefined, src: someUrl };`,
      name: "a src outside a script step",
    },
    {
      code: `export const m = { install: [{ type: 'callGlobal', global: 'gtag' }] };`,
      name: "a step without src",
    },
  ],
});
