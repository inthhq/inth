import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	INTH_PROJECT_HOST_SUFFIXES,
	normalizeProjectURL,
	ProjectURLError,
} from '../../mobile/project-url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../../../..');

interface Cases {
	readonly accept: readonly { input: string; normalized: string }[];
	readonly reject: readonly { input: string; reason: string }[];
}

/** The fixture Swift, Kotlin and TypeScript all run. */
const fixture = JSON.parse(
	readFileSync(
		path.join(REPO, 'packages/native-protocol/project-url/cases.json'),
		'utf8'
	)
) as { allowedHostSuffixes: string[]; relaxed: Cases; strict: Cases };

describe('the Inth project URL rule in the CLI', () => {
	it('is the Expo plugin copy, byte for byte', () => {
		expect(
			readFileSync(path.join(HERE, '../../mobile/project-url.ts'), 'utf8')
		).toBe(
			readFileSync(
				path.join(REPO, 'packages/react-native/src/expo-plugin/project-url.ts'),
				'utf8'
			)
		);
	});

	it('allows the host suffixes the shared fixture lists', () => {
		expect([...INTH_PROJECT_HOST_SUFFIXES]).toStrictEqual(
			fixture.allowedHostSuffixes
		);
	});

	describe.each([
		['strict', false],
		['relaxed', true],
	] as const)('%s', (name, relaxed) => {
		it.each(fixture[name].accept)(
			'accepts $input as $normalized',
			({ input, normalized }) => {
				expect(normalizeProjectURL(input, { relaxed })).toBe(normalized);
			}
		);

		it.each(fixture[name].reject)(
			'refuses $input: $reason',
			({ input, reason }) => {
				let refused: unknown;
				try {
					normalizeProjectURL(input, { relaxed });
				} catch (error) {
					refused = error;
				}
				expect(refused).toBeInstanceOf(ProjectURLError);
				expect((refused as ProjectURLError).reason).toBe(reason);
			}
		);
	});
});
