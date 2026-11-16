import { describe, expect, test, vi } from 'vitest';

import {
	custom,
	hosted,
	local,
	manifest,
	provideModeTransports,
} from './modes';

describe('mode factories', () => {
	test('returns the factory core recognizes, carrying its options', () => {
		const mode = hosted({ backendURL: '/api/c15t' }) as unknown as {
			backendURL?: string;
			kind?: string;
			type?: string;
		};
		expect(mode.type).toBe('hosted');
		expect(mode.kind).toBe('hosted');
		expect(mode.backendURL).toBe('/api/c15t');
	});

	test('builds its transport with the builder the engine hands over', () => {
		const transport = { init: vi.fn() };
		const build = vi.fn(() => transport);
		provideModeTransports({ hosted: build, local: vi.fn() });
		const mode = hosted({ backendURL: '/api/c15t' });
		expect(mode({} as never)).toBe(transport);
		expect(build).toHaveBeenCalledWith(
			expect.objectContaining({ backendURL: '/api/c15t' })
		);
	});

	test('local, manifest and custom carry the kind and options core reads', () => {
		const rules = local({ policyRules: [] }) as unknown as {
			kind: string;
			policyRules: unknown[];
			type: string;
		};
		expect([rules.kind, rules.type, rules.policyRules]).toEqual([
			'offline',
			'offline',
			[],
		]);
		const fromManifest = manifest({
			manifestURL: '/api/c15t/manifest',
		}) as unknown as { kind: string; manifestURL: string };
		expect(fromManifest.kind).toBe('manifest');
		expect(fromManifest.manifestURL).toBe('/api/c15t/manifest');
		const transport = { init: vi.fn(), save: vi.fn() };
		expect(custom(transport)({} as never)).toBe(transport);
	});

	test('local builds with the code the engine hands over', () => {
		const transport = { init: vi.fn() };
		const factory = Object.assign(
			vi.fn(() => transport),
			{ kind: 'offline' as const }
		);
		const build = vi.fn(() => factory);
		provideModeTransports({ hosted: vi.fn(), local: build });
		const mode = local({ acknowledgeNoRecords: true });
		expect(mode({} as never)).toBe(transport);
		expect(build).toHaveBeenCalledWith({ acknowledgeNoRecords: true });
	});

	// Every mode loads its transport code on first use. A failed chunk
	// request must not stick: the next call loads it again.
	test.each([
		[
			'hosted',
			'@c15t/core/transports',
			(init: () => unknown) => ({ createHostedTransport: () => ({ init }) }),
			() => hosted({ backendURL: '/api/c15t' }),
		],
		[
			'manifest',
			'@c15t/core/transports/manifest-browser',
			(init: () => unknown) => ({ manifest: () => () => ({ init }) }),
			() => manifest({ url: '/manifest.json' } as never),
		],
	] as const)(
		'%s loads its transport again after a failed chunk load',
		async (_name, module, exports, mode) => {
			// Built in this module, not with code the engine handed over.
			provideModeTransports(undefined as never);
			let loads = 0;
			const init = vi.fn(() => Promise.resolve({ ok: true }));
			// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens when this chunk fails to load; nothing else can make a dynamic import reject. The factory fails the first load and returns a transport after that.
			vi.doMock(module, () => {
				loads += 1;
				if (loads === 1) {
					throw new Error('chunk failed');
				}
				return exports(init);
			});
			try {
				const transport = (
					mode() as (context: never) => {
						init?: (context: never) => Promise<unknown>;
					}
				)({} as never);
				await expect(transport.init?.({} as never)).rejects.toThrow();

				await transport.init?.({} as never);
				expect(init).toHaveBeenCalledOnce();
			} finally {
				vi.doUnmock(module);
			}
		}
	);
});
