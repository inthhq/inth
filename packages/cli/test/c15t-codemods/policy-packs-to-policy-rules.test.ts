import { afterEach, describe, expect, it } from "vitest";

import { runPolicyPacksToPolicyRulesCodemod as codemod } from "../../src/native/c15t-codemods/policy-packs-to-policy-rules.ts";
import { cleanupProjects, transformFile, transformTwice } from "./helpers.ts";

// Each run builds a TypeScript program, which is slow on a busy machine.
describe("policy-packs-to-policy-rules codemod", { timeout: 20_000 }, () => {
  afterEach(cleanupProjects);

  it("renames the presets and worldNoBanner in the c15t package", async () => {
    const { result, updated } = await transformFile(
      codemod,
      `import { offline, policyPackPresets } from 'c15t';

// EU opt-in, nothing elsewhere.
export const rules = [
	policyPackPresets.europeOptIn(),
	policyPackPresets.worldNoBanner(),
];
`,
      { fileName: "rules.ts" }
    );

    expect(updated).toBe(`import { offline, policyRulePresets } from 'c15t';

// EU opt-in, nothing elsewhere.
export const rules = [
	policyRulePresets.europeOptIn(),
	policyRulePresets.worldOptOutNoPrompt(),
];
`);
    expect(result.changedFiles[0]?.summaries).toEqual([
      "policyPackPresets -> policyRulePresets",
      "worldNoBanner -> worldOptOutNoPrompt",
    ]);
  });

  it("moves React and Next.js imports to the entry that still exports presets", async () => {
    const umbrella = await transformFile(
      codemod,
      `import { ConsentProvider, policyPackPresets } from 'c15t/next';

const rules = [policyPackPresets.californiaOptOut()];
`
    );
    expect(umbrella.updated).toBe(`import { ConsentProvider } from 'c15t/next';
import { policyRulePresets } from 'c15t';

const rules = [policyRulePresets.californiaOptOut()];
`);

    const scoped = await transformFile(
      codemod,
      `import { policyPackPresets } from '@c15t/react';

const rules = [policyPackPresets.worldNoBanner()];
`
    );
    expect(scoped.updated).toBe(`import { policyRulePresets } from '@c15t/core';

const rules = [policyRulePresets.worldOptOutNoPrompt()];
`);
  });

  it("moves several adjacent specifiers on one line", async () => {
    const { result, updated } = await transformFile(
      codemod,
      `import { ConsentProvider, policyPackPresets, type PolicyPackPresets } from 'c15t/next';

export const presets: PolicyPackPresets = policyPackPresets;
`
    );
    expect(result.errors).toEqual([]);
    expect(updated).toBe(`import { ConsentProvider } from 'c15t/next';
import { policyRulePresets, type PolicyRulePresets } from 'c15t';

export const presets: PolicyRulePresets = policyRulePresets;
`);

    const multiLine = await transformFile(
      codemod,
      `import {
	policyPackPresets, type PolicyPackPresets,
	ConsentProvider,
} from '@c15t/react';

export const presets: PolicyPackPresets = policyPackPresets;
`
    );
    expect(multiLine.result.errors).toEqual([]);
    expect(multiLine.updated).toBe(`import {
	ConsentProvider,
} from '@c15t/react';
import { policyRulePresets, type PolicyRulePresets } from '@c15t/core';

export const presets: PolicyRulePresets = policyRulePresets;
`);
  });

  it("keeps an alias and renames destructured presets", async () => {
    const { updated } = await transformFile(
      codemod,
      `import { policyPackPresets as presets, type PolicyPackPresets } from '@c15t/backend';

const { europeOptIn, worldNoBanner } = presets;
const { worldNoBanner: none } = presets;
type Presets = PolicyPackPresets;
export const policyPacks = [europeOptIn(), worldNoBanner(), none()];
`,
      { fileName: "backend.ts" }
    );

    expect(updated)
      .toBe(`import { policyRulePresets as presets, type PolicyRulePresets } from '@c15t/backend';

const { europeOptIn, worldOptOutNoPrompt: worldNoBanner } = presets;
const { worldOptOutNoPrompt: none } = presets;
type Presets = PolicyRulePresets;
export const policyPacks = [europeOptIn(), worldNoBanner(), none()];
`);
  });

  it("keeps shorthand property keys and local export names", async () => {
    const { first, second } = await transformTwice(
      codemod,
      `import { policyPackPresets, type PolicyPackPresets } from 'c15t';

export const config = { policyPackPresets };
export { policyPackPresets, type PolicyPackPresets };
`,
      "rules.ts"
    );
    expect(first)
      .toBe(`import { policyRulePresets, type PolicyRulePresets } from 'c15t';

export const config = { policyPackPresets: policyRulePresets };
export { policyRulePresets as policyPackPresets, type PolicyRulePresets as PolicyPackPresets };
`);
    expect(second).toBe(first);
  });

  it("renames access through a namespace import", async () => {
    const { updated } = await transformFile(
      codemod,
      `import * as c15t from 'c15t';

export const rule = c15t.policyPackPresets.worldNoBanner();
`,
      { fileName: "rules.ts" }
    );
    expect(updated).toContain("c15t.policyRulePresets.worldOptOutNoPrompt()");
  });

  it("renames the presets type through a namespace import", async () => {
    const { updated } = await transformFile(
      codemod,
      `import type * as c15t from 'c15t';

export type Presets = c15t.PolicyPackPresets;
`,
      { fileName: "rules.ts" }
    );
    expect(updated).toBe(`import type * as c15t from 'c15t';

export type Presets = c15t.PolicyRulePresets;
`);
  });

  it("renames re-exports and keeps the exported name", async () => {
    const { first, second } = await transformTwice(
      codemod,
      `export { policyPackPresets, type PolicyPackPresets as Presets } from 'c15t';
export { policyPackPresets as presets } from '@c15t/react';
`,
      "rules.ts"
    );
    expect(first)
      .toBe(`export { policyRulePresets as policyPackPresets, type PolicyRulePresets as Presets } from 'c15t';
export { policyRulePresets as presets } from '@c15t/core';
`);
    expect(second).toBe(first);
  });

  it("leaves a TODO for presets reached through a namespace of an entry that dropped them", async () => {
    const source = `import * as c15t from 'c15t/react';

export const rules = [c15t.policyPackPresets.worldNoBanner(), c15t.policyPackPresets.europeOptIn()];
`;
    const { first, second, secondResult } = await transformTwice(
      codemod,
      source,
      "rules.ts"
    );
    expect(first)
      .toBe(`// TODO(c15t v3): c15t.policyPackPresets: c15t/react no longer exports presets. Import policyRulePresets from c15t.
import * as c15t from 'c15t/react';

export const rules = [c15t.policyPackPresets.worldOptOutNoPrompt(), c15t.policyPackPresets.europeOptIn()];
`);
    expect(second).toBe(first);
    expect(secondResult.changedFiles).toEqual([]);
  });

  it("leaves unrelated and migrated code alone, and is idempotent", async () => {
    const unrelated = await transformFile(
      codemod,
      `import { policyPackPresets } from './presets';
export const rule = policyPackPresets.worldNoBanner();
`,
      { fileName: "rules.ts" }
    );
    expect(unrelated.result.changedFiles).toEqual([]);

    const migrated = await transformFile(
      codemod,
      `import { policyRulePresets } from 'c15t';
export const rule = policyRulePresets.worldOptOutNoPrompt();
`,
      { fileName: "rules.ts" }
    );
    expect(migrated.result.changedFiles).toEqual([]);

    // `worldNone()` is a separate v3 preset that grants no rights.
    const worldNone = await transformFile(
      codemod,
      `import { policyRulePresets } from 'c15t';
export const rule = policyRulePresets.worldNone();
`,
      { fileName: "rules.ts" }
    );
    expect(worldNone.result.changedFiles).toEqual([]);

    const { first, second } = await transformTwice(
      codemod,
      `import { ConsentProvider, policyPackPresets } from '@c15t/nextjs';
const rules = [policyPackPresets.europeIab(), policyPackPresets.worldNoBanner()];
`
    );
    expect(second).toBe(first);
  });

  it("writes nothing in a dry run", async () => {
    const source = `import { policyPackPresets } from 'c15t';
export const rule = policyPackPresets.quebecOptIn();
`;
    const { result, updated } = await transformFile(codemod, source, {
      dryRun: true,
      fileName: "rules.ts",
    });
    expect(updated).toBe(source);
    expect(result.changedFiles).toHaveLength(1);
  });
});
