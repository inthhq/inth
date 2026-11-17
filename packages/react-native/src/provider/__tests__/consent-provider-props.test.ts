/**
 * What TypeScript tells a developer who renders `<ConsentProvider>` with no
 * props. The fix is to pass `privacyPolicyURL`, so that is the property the
 * error must name, not `autoPresent`.
 *
 * TypeScript 7 has no JavaScript compiler API, so this runs the package's own
 * `tsc` on a one-line consumer.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, expect, test } from 'vitest';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
// Inside the package, so `react` and its types resolve the way they do for src.
const cacheDir = join(packageDir, 'node_modules/.cache');
mkdirSync(cacheDir, { recursive: true });
const workDir = mkdtempSync(join(cacheDir, 'provider-props-'));

afterAll(() => {
	rmSync(workDir, { force: true, recursive: true });
});

/**
 * Type-check one consumer file against the package's compiler settings.
 *
 * @param source - The consumer's TSX.
 * @returns The compiler's output; empty when it type-checks.
 */
const typeCheck = function typeCheck(source: string): string {
	const provider = join(packageDir, 'src/provider/consent-provider');
	writeFileSync(
		join(workDir, 'consumer.tsx'),
		`import { ConsentProvider } from ${JSON.stringify(provider)};\n${source}\n`
	);
	writeFileSync(
		join(workDir, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: { noEmit: true, rootDir: packageDir },
			extends: join(packageDir, 'tsconfig.json'),
			files: ['consumer.tsx'],
			include: [],
		})
	);
	try {
		execFileSync(
			join(packageDir, 'node_modules/.bin/tsc'),
			['-p', join(workDir, 'tsconfig.json')],
			{ encoding: 'utf8' }
		);
		return '';
	} catch (error: unknown) {
		return String((error as { stdout?: unknown }).stdout ?? error);
	}
};

test('a provider with no props is told that privacyPolicyURL is missing', () => {
	const output = typeCheck(
		'export const app = <ConsentProvider><span /></ConsentProvider>;'
	);

	expect(output).toContain("Property 'privacyPolicyURL' is missing");
	expect(output).not.toContain("Property 'autoPresent' is missing");
}, 60_000);

test('the one-line form type-checks', () => {
	expect(
		typeCheck(
			'export const app = <ConsentProvider privacyPolicyURL="https://example.com/privacy"><span /></ConsentProvider>;'
		)
	).toBe('');
}, 60_000);
