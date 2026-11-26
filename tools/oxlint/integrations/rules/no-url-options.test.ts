import { RuleTester } from "vite-plus/lint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { noUrlOptionsRule } from "./no-url-options.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  filename: "packages/sdk/integrations/src/vendors/analytics/example.ts",
  languageOptions: { parserOptions: { lang: "ts" } },
});

const idOption = `{ kind: 'id', label: 'X', pattern: '^a$', required: true }`;

tester.run("no-url-options", noUrlOptionsRule, {
  invalid: [
    ...[
      "scriptUrl",
      "src",
      "scriptSource",
      "apiEndpoint",
      "apiHost",
      "host",
      "cdnURL",
    ].map((name) => ({
      code: `export const remote = defineRemote('example', { ${name}: ${idOption} }, resolve);`,
      errors: [{ message: new RegExp(`^Remote option \`${name}\``, "u") }],
      name: `an id option named ${name}`,
    })),
    {
      code: `export const remote = defineRemoteIntegration('example', { scriptUrl: { kind: 'enum', label: 'X', values: ['a'], default: 'a' } }, resolve);`,
      errors: 1,
      name: "an enum option in remote.ts's helper",
    },
    {
      code: `
        const scriptUrlOption = { kind: 'id', label: 'X', pattern: '^a$', required: true } as const;
        export const remote = defineRemote('example', { scriptUrl: scriptUrlOption }, resolve);
      `,
      errors: 1,
      name: "a spec from a const",
    },
    {
      code: `
        const options = { trackerHost: ${idOption} };
        export const remote = defineRemote('example', options, resolve);
      `,
      errors: 1,
      name: "an options object from a const",
    },
    {
      code: `export const remote = defineRemote('example', { scriptUrl: makeSpec() }, resolve);`,
      errors: 1,
      name: "a spec whose kind is unknown",
    },
    {
      code: `
        const scriptOptions = { scriptUrl: ${idOption} };
        export const remote = defineRemoteIntegration('example', { ...scriptOptions }, resolve);
      `,
      errors: [{ message: /^Remote option `scriptUrl`/u }],
      name: "an option spread from a const",
    },
    {
      code: `export const remote = defineRemote('example', { id: ${idOption}, ...{ scriptSrc: ${idOption} } }, resolve);`,
      errors: 1,
      name: "an option spread from a literal",
    },
    {
      code: `
        const hostSpec = { kind: 'hostname', label: 'X' } as const;
        export const remote = defineRemote('example', { trackerHost: { ...hostSpec, kind: 'id' } }, resolve);
      `,
      errors: 1,
      name: "a hostname kind overridden after a spread",
    },
    {
      code: `export const make = (extra: object) => defineRemote('example', { ...extra }, resolve);`,
      errors: [{ messageId: "unresolved" }],
      name: "a spread the rule cannot follow",
    },
    {
      code: `export const remote = defineRemote('example', makeOptions(), resolve);`,
      errors: [{ messageId: "unresolved" }],
      name: "options the rule cannot follow",
    },
  ],
  valid: [
    {
      code: `export const remote = defineRemote('example', { id: ${idOption}, region: { kind: 'enum', label: 'Region', values: ['eu', 'us'], default: 'eu' } }, resolve);`,
      name: "ID and enum options",
    },
    {
      code: `export const remote = defineRemote('pardot', { trackerHost: { kind: 'hostname', label: 'Tracker domain', required: true } }, resolve);`,
      name: "a hostname option",
    },
    {
      code: `
        const trackerHost = { kind: 'hostname', label: 'Tracker domain', required: true } as const;
        export const remote = defineRemote('pardot', { trackerHost }, resolve);
      `,
      name: "a hostname option from a const",
    },
    {
      code: `export interface Options { scriptUrl?: string } export const helper = (options: Options) => ({ scriptUrl: options.scriptUrl });`,
      name: "npm helper options",
    },
    {
      code: `export const remote = defineSomethingElse('example', { scriptUrl: ${idOption} });`,
      name: "another function",
    },
    {
      code: `
        const hostSpec = { kind: 'hostname', label: 'X' } as const;
        export const remote = defineRemote('example', { trackerHost: { label: 'Tracker', ...hostSpec } }, resolve);
      `,
      name: "a hostname kind from a spread",
    },
    {
      code: `
        const shared = { region: { kind: 'enum', label: 'Region', values: ['eu'], default: 'eu' } } as const;
        export const remote = defineRemote('example', { id: ${idOption}, ...shared }, resolve);
      `,
      name: "spread options with no URL names",
    },
    {
      code: `export const remote = defineRemote('example', { resourceKey: ${idOption} }, resolve);`,
      name: "a name that contains source inside another word",
    },
  ],
});
