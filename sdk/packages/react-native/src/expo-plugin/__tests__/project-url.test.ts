import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	INTH_PROJECT_HOST_SUFFIXES,
	normalizeProjectURL,
	ProjectURLError,
} from '../project-url';

interface Accepted {
	readonly input: string;
	readonly normalized: string;
}
interface Refused {
	readonly input: string;
	readonly reason: string;
}
interface Cases {
	readonly accept: readonly Accepted[];
	readonly reject: readonly Refused[];
}

/** The fixture Swift, Kotlin and TypeScript all run. */
const fixture = JSON.parse(
	readFileSync(
		resolve(
			dirname(fileURLToPath(import.meta.url)),
			'../../../../../native/protocol/project-url/cases.json'
		),
		'utf8'
	)
) as {
	allowedHostSuffixes: string[];
	reasons: Record<string, string>;
	relaxed: Cases;
	strict: Cases;
};

const reasonOf = (input: string, relaxed: boolean): string | null => {
	try {
		normalizeProjectURL(input, { relaxed });
		return null;
	} catch (error) {
		if (error instanceof ProjectURLError) {
			return error.reason;
		}
		throw error;
	}
};

describe('the Inth project URL rule', () => {
	it('allows the host suffixes the shared fixture lists', () => {
		expect([...INTH_PROJECT_HOST_SUFFIXES]).toStrictEqual(
			fixture.allowedHostSuffixes
		);
	});

	it('has cases to run', () => {
		for (const cases of [fixture.strict, fixture.relaxed]) {
			expect(cases.accept.length).toBeGreaterThan(0);
			expect(cases.reject.length).toBeGreaterThan(0);
		}
	});

	describe.each([
		['strict', false],
		['relaxed', true],
	] as const)('%s', (name, relaxed) => {
		it.each(fixture[name].accept)(
			'accepts $input as $normalized',
			({ input, normalized }) => {
				expect(normalizeProjectURL(input, { relaxed })).toBe(normalized);
				// The normal form is what native code reads back, so it must pass again.
				expect(normalizeProjectURL(normalized, { relaxed })).toBe(normalized);
			}
		);

		it.each(fixture[name].reject)(
			'refuses $input: $reason',
			({ input, reason }) => {
				expect(Object.keys(fixture.reasons)).toContain(reason);
				expect(reasonOf(input, relaxed)).toBe(reason);
			}
		);
	});

	it('says what was given and what is wrong, under the option name', () => {
		expect(() => normalizeProjectURL('https://consent.example.com')).toThrow(
			'backendURL must be the project URL from your Inth dashboard, such as https://your-project.inth.app. Got "https://consent.example.com": the host must be a project host under inth.app.'
		);
		expect(() =>
			normalizeProjectURL('http://acme.inth.app', { option: '--backend-url' })
		).toThrow(
			'--backend-url must be the project URL from your Inth dashboard, such as https://your-project.inth.app. Got "http://acme.inth.app": the scheme must be https.'
		);
	});
});
