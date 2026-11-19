/**
 * The page script loads every init path on demand.
 *
 * `testing()` carries the recommended policy-rule pack, and the hosted
 * transport's init path is only needed when a page inits again. A page the
 * server resolved runs neither, so the browser client must not import them
 * statically. `@inth/sdk/runtime/client-mode` loads the hosted init path
 * with `import()`, and its own tests pin that; a test page's init must still
 * resolve its rules.
 *
 * The load-count tests share one module registry and run in order.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ProviderTransportContext } from '@inth/sdk/engine';
import { describe, expect, it, vi } from 'vitest';

import { hosted as hostedMode } from '../mode';
import { testing as testingMode } from '../testing';
import { lazyTransport, testingTransport } from '../transport';
import { testRule } from './policy-fixture';

const testingModule = vi.hoisted(() => ({ loads: 0 }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is whether the client evaluates this module at all. The factory only counts loads and returns the real module.
vi.mock('../testing-transport', async (importOriginal) => {
	testingModule.loads += 1;
	return await importOriginal();
});

const context: ProviderTransportContext = {
	consentCategories: ['necessary', 'measurement'],
	prefetch: {},
	translations: { language: 'en', translations: {} as never },
};

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Names that pull the testing transport, a rule pack or the hosted init
 * path into a bundle.
 */
const INIT_ONLY = new Set([
	'createV1HostedTransport',
	'createOfflineTransport',
	'createTestingMode',
	'hosted',
	'offline',
	'policyRulePresets',
	'recommendedPolicyRules',
]);

const STATIC_IMPORT =
	/^\s*import\s+(?!type\b)(?<clause>[^'";]*?)\s*from\s*['"](?<specifier>[^'"]+)['"]/gmu;
const EXPORT_FROM =
	/^\s*export\s+(?!type\b)(?<clause>\{[^}]*\})\s*from\s*['"](?<specifier>[^'"]+)['"]/gmu;

const resolveLocal = function resolveLocal(
	from: string,
	specifier: string
): string {
	const base = resolve(dirname(from), specifier);
	return base.endsWith('.ts') ? base : `${base}.ts`;
};

/** Every static value import reachable from `entry` inside this package. */
const walk = function walk(entry: string, skip: string[] = []) {
	const seen = new Set<string>(skip);
	const edges: { file: string; specifier: string; names: string[] }[] = [];
	const visit = (file: string) => {
		if (seen.has(file)) {
			return;
		}
		seen.add(file);
		const source = readFileSync(file, 'utf8');
		for (const pattern of [STATIC_IMPORT, EXPORT_FROM]) {
			for (const match of source.matchAll(pattern)) {
				const specifier = match.groups?.specifier ?? '';
				const names = [
					...(match.groups?.clause ?? '').matchAll(
						/(?:^|[{,\s])(?!type\b)(?<name>[A-Za-z_$][\w$]*)/gu
					),
				]
					.map((name) => name.groups?.name ?? '')
					.filter((name) => name && name !== 'as');
				edges.push({ file, names, specifier });
				if (specifier.startsWith('.')) {
					visit(resolveLocal(file, specifier));
				}
			}
		}
	};
	visit(entry);
	return { edges, files: seen };
};

describe('browser client graph', () => {
	it('does not statically import an init path or a rule pack', () => {
		// The client re-exports every transport, and the boot script imports
		// the one its mode runs, so a bundler drops the others. Everything
		// else the client imports ships with every page.
		const transport = resolve(SRC, 'transport.ts');
		const { edges, files } = walk(resolve(SRC, 'client.ts'), [transport]);

		expect(files.has(resolve(SRC, 'testing-transport.ts'))).toBe(false);
		const offenders = edges.filter(
			(edge) =>
				!edge.specifier.startsWith('.') &&
				edge.names.some((name) => INIT_ONLY.has(name))
		);
		expect(offenders).toEqual([]);
	});

	it('loads testing mode only with import()', () => {
		const { files } = walk(resolve(SRC, 'transport.ts'));
		expect(files.has(resolve(SRC, 'testing-transport.ts'))).toBe(false);
	});
});

describe('testing mode on demand', () => {
	it('hosted mode never loads it', () => {
		const transport = lazyTransport({
			mode: hostedMode(),
			projectUrl: '/x',
		})(context);
		expect(transport).toBeDefined();
		expect(testingModule.loads).toBe(0);
	});

	it('a testing transport loads nothing until it inits, and saves without it', async () => {
		const transport = testingTransport({
			mode: testingMode({ policy: [testRule] }),
		})(context);
		const saved = await transport.save?.({
			subjectId: 'sub_1',
		} as never);

		expect(saved).toEqual({ ok: true, subjectId: 'sub_1' });
		expect(testingModule.loads).toBe(0);
	});

	it('a testing init loads it once and resolves the rules', async () => {
		const transport = testingTransport({
			mode: testingMode({ policy: [testRule] }),
		})(context);
		const [first, second] = await Promise.all([
			transport.init?.({ overrides: {}, user: null }),
			transport.init?.({ overrides: { country: 'DE' }, user: null }),
		]);

		expect(testingModule.loads).toBe(1);
		expect(first?.policyResolution).toMatchObject({
			policy: { id: 'test', prompt: 'choice' },
			status: 'matched',
		});
		expect(second?.location).toEqual({ countryCode: 'DE', regionCode: null });
	});
});
