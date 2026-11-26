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
const hostPlaceholder = { messageId: "hostPlaceholder" };

/** A file whose manifest loads `src` and whose remote options are `options`. */
const partnerFile = (src: string, options: string): string => `
  export const m = { install: [{ src: '${src}', type: 'loadScript' }] };
  export const remote = defineRemote('insiderTag', { ${options} }, resolve);
`;
const LABEL_SRC =
  "https://{{partnerName}}.api.useinsider.com/ins.js?id={{partnerId}}";
const LABEL_PATTERN = "^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$";
/** A `partnerName` id option; `pattern` is written into a single-quoted string. */
const labelOption = (pattern: string, name = "partnerName"): string =>
  `${name}: { example: 'acme', kind: 'id', label: 'Partner name', pattern: '${pattern}', required: true }`;

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
      code: `const LOAD_SCRIPT = 'loadScript';\nexport const step = { src: '{{scriptUrl}}', type: LOAD_SCRIPT };`,
      errors: [notFixed],
      name: "a step whose type comes from a const",
    },
    {
      code: "export const step = { src: '{{scriptUrl}}', type: `loadScript` };",
      errors: [notFixed],
      name: "a step whose type is a template literal",
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
    {
      code: `
        const source = { src: '{{scriptUrl}}' };
        export const step = { type: 'loadScript' as const, ...source };
      `,
      errors: [{ column: 59, line: 3, messageId: "notFixed" }],
      name: "a src hidden in a spread const",
    },
    {
      code: `export const step = { type: 'loadScript', ...{ src: '{{scriptUrl}}' } };`,
      errors: [notFixed],
      name: "a src hidden in a spread literal",
    },
    {
      code: `
        const base = { type: 'loadScript' } as const;
        export const step = { ...base, src: '{{scriptUrl}}' };
      `,
      errors: [notFixed],
      name: "a step type from a spread",
    },
    {
      code: `export const step = (extra: object) => ({ src: 'https://cdn.example.com/a.js', type: 'loadScript', ...extra });`,
      errors: [{ messageId: "unresolved" }],
      name: "a spread the rule cannot follow after src",
    },
    {
      code: `
        const key = 'src';
        export const step = { type: 'loadScript', [key]: '{{scriptUrl}}' };
      `,
      errors: [{ messageId: "unresolved" }],
      name: "a computed key",
    },
    {
      code: `
        const step = { src: '{{scriptUrl}}' };
        export const m = { install: [step] };
      `,
      errors: [notFixed],
      name: "an install entry from a const",
    },
    {
      code: `
        const unrelated = { trackerDomain: { kind: 'hostname' } };
        export const m = { install: [{ src: 'https://{{trackerDomain}}/pd.js', type: 'loadScript' }] };
      `,
      errors: [{ messageId: "hostPlaceholder" }],
      name: "a hostname declaration outside the remote options",
    },
    {
      code: `
        export const m = { install: [{ src: 'https://{{trackerDomain}}/pd.js', type: 'loadScript' }] };
        export const remote = defineRemote('pardot', {
          otherDomain: { kind: 'hostname', label: 'Other', required: true },
        }, resolve);
      `,
      errors: [{ messageId: "hostPlaceholder" }],
      name: "a hostname option with another name",
    },
    {
      code: `
        export const m = { install: [{ src: 'https://{{trackerDomain}}/pd.js', type: 'loadScript' }] };
        export const remote = defineRemote('pardot', {
          settings: { trackerDomain: { kind: 'hostname' } },
        }, resolve);
      `,
      errors: [{ messageId: "hostPlaceholder" }],
      name: "a hostname declaration nested inside an option",
    },
    {
      code: `
        export const m = { install: [{ src: 'https://{{trackerDomain}}/pd.js', type: 'loadScript' }] };
        export const remote = defineRemote('pardot', {}, () => ({ trackerDomain: { kind: 'hostname' } }));
      `,
      errors: [{ messageId: "hostPlaceholder" }],
      name: "a hostname declaration in the resolver",
    },
    {
      code: partnerFile(
        "https://cdn.{{partnerName}}.useinsider.com/ins.js",
        labelOption(LABEL_PATTERN)
      ),
      errors: [hostPlaceholder],
      name: "an id label placeholder that is not the leftmost label",
    },
    {
      code: partnerFile(
        "https://{{partnerName}}.useinsider/ins.js",
        labelOption(LABEL_PATTERN)
      ),
      errors: [hostPlaceholder],
      name: "an id label placeholder followed by a single-label domain",
    },
    {
      code: partnerFile(
        "https://{{partnerName}}/ins.js",
        labelOption(LABEL_PATTERN)
      ),
      errors: [hostPlaceholder],
      name: "an id placeholder for the whole host",
    },
    {
      code: partnerFile(
        "https://{{partnerName}}-cdn.useinsider.com/ins.js",
        labelOption(LABEL_PATTERN)
      ),
      errors: [hostPlaceholder],
      name: "an id placeholder for part of the leftmost label",
    },
    {
      code: partnerFile(
        "https://{{partnerName}}.{{region}}.useinsider.com/ins.js",
        `${labelOption(LABEL_PATTERN)}, ${labelOption(LABEL_PATTERN, "region")}`
      ),
      errors: [hostPlaceholder],
      name: "a second placeholder in the vendor domain",
    },
    {
      code: partnerFile(
        "https://{{partnerName}}.api.useinsider.com:8443/ins.js",
        labelOption(LABEL_PATTERN)
      ),
      errors: [hostPlaceholder],
      name: "an id label placeholder with a port",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("^[a-z0-9.-]+$")),
      errors: [hostPlaceholder],
      name: "an id pattern that allows dots",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("^.+$")),
      errors: [hostPlaceholder],
      name: "an id pattern with a wildcard",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("^[^/]+$")),
      errors: [hostPlaceholder],
      name: "an id pattern with a negated class",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("^[+-9]+$")),
      errors: [hostPlaceholder],
      name: "an id pattern whose class range spans a dot",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("^[0-z]+$")),
      errors: [hostPlaceholder],
      name: "an id pattern whose class range spans punctuation",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("^[a-z-.]+$")),
      errors: [hostPlaceholder],
      name: "an id pattern with a hyphen inside a class that is not a range",
    },
    {
      // The source text '^[\\w-]+$' holds the pattern ^[\w-]+$.
      code: partnerFile(LABEL_SRC, labelOption(String.raw`^[\\w-]+$`)),
      errors: [hostPlaceholder],
      name: "an id pattern with an escape",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("[a-z0-9-]+")),
      errors: [hostPlaceholder],
      name: "an unanchored id pattern",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("^[a-z0-9-]+")),
      errors: [hostPlaceholder],
      name: "an id pattern anchored only at the start",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("^[a-z]+$|^evil.example$")),
      errors: [hostPlaceholder],
      name: "an id pattern with an alternation",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("^(?:[a-z]|[0-9])+$")),
      errors: [hostPlaceholder],
      name: "an id pattern with an alternation inside a group",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("^(?=a)[a-z]+$")),
      errors: [hostPlaceholder],
      name: "an id pattern with a lookahead",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("^[a-z]*$")),
      errors: [hostPlaceholder],
      name: "an id pattern that matches an empty label",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption("^[a-z]{2,1}$")),
      errors: [hostPlaceholder],
      name: "an id pattern that does not compile",
    },
    {
      code: `
        const PATTERN = String('^[a-z]+$');
        ${partnerFile(LABEL_SRC, "partnerName: { kind: 'id', label: 'Partner', pattern: PATTERN, required: true }")}
      `,
      errors: [hostPlaceholder],
      name: "an id pattern the rule cannot read",
    },
    {
      code: `
        const unrelated = { ${labelOption(LABEL_PATTERN)} };
        export const m = { install: [{ src: '${LABEL_SRC}', type: 'loadScript' }] };
      `,
      errors: [hostPlaceholder],
      name: "an id label option declared outside the remote options",
    },
    {
      code: partnerFile(
        LABEL_SRC,
        `settings: { kind: 'object', label: 'Settings', required: true, fields: { ${labelOption(LABEL_PATTERN)} } }`
      ),
      errors: [hostPlaceholder],
      name: "an id label option nested inside an object option",
    },
    {
      code: partnerFile(
        LABEL_SRC,
        "partnerName: { kind: 'idList', label: 'Partner', pattern: '^[a-z]+$', maxItems: 2, required: true }"
      ),
      errors: [hostPlaceholder],
      name: "an idList option in the leftmost label",
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
    {
      code: `
        const source = { src: 'https://cdn.example.com/a.js' };
        export const step = { type: 'loadScript', ...source };
      `,
      name: "a spread src with a literal host",
    },
    {
      code: `export const step = (base: object) => ({ ...base, src: 'https://cdn.example.com/a.js', type: 'loadScript' });`,
      name: "a literal src after a spread the rule cannot follow",
    },
    {
      code: `
        const options = {
          trackerDomain: { kind: 'hostname', label: 'Tracker domain', required: true },
        } as const;
        export const m = { install: [{ src: 'https://{{trackerDomain}}/pd.js', type: 'loadScript' }] };
        export const remote = defineRemoteIntegration('pardot', options, resolve);
      `,
      name: "a hostname option in a const options object",
    },
    {
      code: `
        const hostOptions = { trackerDomain: { kind: 'hostname', label: 'Tracker domain', required: true } };
        export const m = { install: [{ src: 'https://{{trackerDomain}}/pd.js', type: 'loadScript' }] };
        export const remote = defineRemote('pardot', { ...hostOptions }, resolve);
      `,
      name: "a hostname option spread into the options",
    },
    {
      code: partnerFile(LABEL_SRC, labelOption(LABEL_PATTERN)),
      name: "an id option as the leftmost label of a fixed vendor domain",
    },
    {
      code: `
        const PARTNER_PATTERN = '^[A-Za-z0-9-]+$';
        const options = {
          partnerName: { example: 'acme', kind: 'id', label: 'Partner', pattern: PARTNER_PATTERN, required: true },
        } as const;
        export const m = { install: [{ src: '${LABEL_SRC}', type: 'loadScript' }] };
        export const remote = defineRemote('insiderTag', options, resolve);
      `,
      name: "an id label pattern from a const",
    },
  ],
});
