// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test';

import {
	remoteModeStatus,
	remoteOptionStatus,
	remoteStatus,
} from './__tests__/remote-status';
import type { RemoteStatus } from './__tests__/remote-status';
import { builtInScriptIntegrations } from './registry';
import type { BuiltInScriptIntegrationKey } from './registry';
import { remoteIntegrations } from './remote';
import { remoteDefinitions, remoteOf } from './remote-catalogue';
import type { RemoteOptionSpec } from './remote-define';

const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'prototype'];

const statusOf = function statusOf(key: string): RemoteStatus | undefined {
	return Object.hasOwn(remoteStatus, key)
		? (remoteStatus as Record<string, RemoteStatus>)[key]
		: undefined;
};

/**
 * Whether `pattern` matches only whole strings: it starts with `^`, ends
 * with an unescaped `$`, and has no `|` outside a group or class, which
 * would let one alternative go unanchored (`^abc|.*$`).
 */
const isAnchored = function isAnchored(pattern: string): boolean {
	if (!pattern.startsWith('^') || !pattern.endsWith('$')) {
		return false;
	}
	let depth = 0;
	let inClass = false;
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index];
		if (char === '\\') {
			if (index === pattern.length - 2) {
				// The final `$` is escaped, so it matches a literal dollar.
				return false;
			}
			index += 1;
		} else if (inClass) {
			inClass = char !== ']';
		} else if (char === '[') {
			inClass = true;
		} else if (char === '(') {
			depth += 1;
		} else if (char === ')') {
			depth -= 1;
		} else if (char === '|' && depth === 0) {
			return false;
		}
	}
	return true;
};

/** Problems with one option spec, which a form and the validator rely on. */
const specProblems = function specProblems(
	path: string,
	spec: RemoteOptionSpec,
	depth: number
): string[] {
	const problems: string[] = [];
	const anchored = (pattern: string, field: string) => {
		if (!isAnchored(pattern)) {
			problems.push(`${path}.${field} is not anchored at both ends`);
		}
	};
	if (spec.label.trim() === '') {
		problems.push(`${path} has no label`);
	}
	switch (spec.kind) {
		case 'id':
		case 'idList': {
			anchored(spec.pattern, 'pattern');
			if (!new RegExp(spec.pattern, 'u').test(spec.example)) {
				problems.push(`${path}.example does not match its pattern`);
			}
			break;
		}
		case 'map': {
			anchored(spec.keyPattern, 'keyPattern');
			if (spec.values.length === 0) {
				problems.push(`${path} has no values`);
			}
			break;
		}
		case 'enum': {
			if (!spec.values.includes(spec.default)) {
				problems.push(`${path}.default is not one of its values`);
			}
			break;
		}
		case 'object': {
			if (depth > 2) {
				problems.push(`${path} nests objects more than two levels deep`);
			}
			for (const [name, field] of Object.entries(spec.fields)) {
				problems.push(...specProblems(`${path}.${name}`, field, depth + 1));
			}
			break;
		}
		default: {
			break;
		}
	}
	const name = path.split('.').at(-1) ?? '';
	if (PROTOTYPE_KEYS.includes(name)) {
		problems.push(`${path} uses a prototype key as its name`);
	}
	return problems;
};

describe('remote catalogue', () => {
	it.each(builtInScriptIntegrations.map((entry) => entry.key))(
		'%s is remote, pending or npm-only, and only one',
		(key) => {
			const definition = remoteOf(key);
			const status = statusOf(key);

			expect(
				definition === undefined ? status : 'remote',
				`${key}: export remote from its vendor file, or list it in src/__tests__/remote-status.ts`
			).toBeDefined();
			expect(
				definition !== undefined && status !== undefined,
				`${key} exports remote, so remove it from src/__tests__/remote-status.ts`
			).toBe(false);
		}
	);

	it.each(Object.entries(remoteModeStatus))(
		'%s offers no mode its remote definition leaves out',
		(key, modes) => {
			const mode = remoteOf(key as BuiltInScriptIntegrationKey)?.options.mode;

			expect(mode?.kind, `${key} has no remote mode option`).toBe('enum');
			const values = mode?.kind === 'enum' ? mode.values : [];
			expect(values.filter((value) => Object.hasOwn(modes, value))).toEqual([]);
		}
	);

	it.each(Object.entries(remoteOptionStatus))(
		'%s declares no option a later pull request adds',
		(key, options) => {
			const definition = remoteOf(key as BuiltInScriptIntegrationKey);

			expect(definition, `${key} has no remote definition`).toBeDefined();
			expect(
				Object.keys(definition?.options ?? {}).filter((name) =>
					Object.hasOwn(options, name)
				)
			).toEqual([]);
		}
	);

	it('lists no status for a key the registry lacks', () => {
		const keys = new Set<string>(
			builtInScriptIntegrations.map((entry) => entry.key)
		);

		expect(Object.keys(remoteStatus).filter((key) => !keys.has(key))).toEqual(
			[]
		);
	});

	it('gives every npm-only vendor a reason', () => {
		const statuses: Record<string, RemoteStatus> = remoteStatus;
		for (const [key, status] of Object.entries(statuses)) {
			const reason = status.status === 'npm-only' ? status.reason : 'pending';

			expect(reason.trim(), key).not.toBe('');
		}
	});

	it('finds each remote export under the key it was defined for', () => {
		for (const entry of builtInScriptIntegrations) {
			expect(remoteOf(entry.key)?.key ?? entry.key).toBe(entry.key);
		}
	});

	it('serves every remote export, in registry order', () => {
		expect(Object.keys(remoteIntegrations)).toEqual(
			remoteDefinitions.map((definition) => definition.key)
		);
		expect(remoteDefinitions.map((definition) => definition.key)).toEqual(
			builtInScriptIntegrations
				.filter((entry) => remoteOf(entry.key) !== undefined)
				.map((entry) => entry.key)
		);
	});

	it.each(remoteDefinitions.map((definition) => [definition.key, definition]))(
		'%s declares well-formed options',
		(key, definition) => {
			const problems = Object.entries(definition.options).flatMap(
				([name, spec]) => specProblems(`${key}.${name}`, spec, 1)
			);

			expect(problems).toEqual([]);
		}
	);

	describe('specProblems', () => {
		it('reports an object nested three levels deep', () => {
			const spec = {
				fields: {
					inner: {
						fields: {
							deepest: {
								fields: {},
								kind: 'object',
								label: 'Deepest',
								required: false,
							},
						},
						kind: 'object',
						label: 'Inner',
						required: false,
					},
				},
				kind: 'object',
				label: 'Outer',
				required: false,
			} as unknown as RemoteOptionSpec;

			expect(specProblems('x.outer', spec, 1)).toEqual([
				'x.outer.inner.deepest nests objects more than two levels deep',
			]);
		});

		it('reports an unanchored pattern and an example that misses it', () => {
			expect(
				specProblems(
					'x.id',
					{
						example: 'abc',
						kind: 'id',
						label: 'ID',
						pattern: '[0-9]+',
						required: true,
					},
					1
				)
			).toEqual([
				'x.id.pattern is not anchored at both ends',
				'x.id.example does not match its pattern',
			]);
		});

		it.each(['^abc|.*$', '^a$|^b$', '^abc\\$'])(
			'reports %s as not anchored',
			(pattern) => {
				expect(
					specProblems(
						'x.id',
						{
							example: 'abc',
							kind: 'id',
							label: 'ID',
							pattern,
							required: true,
						},
						1
					)
				).toContain('x.id.pattern is not anchored at both ends');
			}
		);

		it.each(['^(?:a|b)$', '^[|a]+$', '^a\\|b$'])(
			'accepts %s as anchored',
			(pattern) => {
				expect(
					specProblems(
						'x.id',
						{ example: 'a', kind: 'id', label: 'ID', pattern, required: true },
						1
					)
				).not.toContain('x.id.pattern is not anchored at both ends');
			}
		);
	});
});
