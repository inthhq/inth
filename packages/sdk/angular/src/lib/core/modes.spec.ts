import { hosted } from '@inth/sdk/modes';
import { describe, expect, test, vi } from 'vitest';

import { testing } from '../../../testing/src/testing-mode';
import {
	hostedFor,
	manifest,
	provideModeTransports,
	selectedMode,
} from './modes';

describe('the transports provideInth() selects', () => {
	test('a backend URL alone is the hosted backend, with its options as data', () => {
		const mode = selectedMode({ projectUrl: '/api/inth' }) as unknown as {
			projectUrl?: string;
			kind?: string;
			type?: string;
		};
		expect(mode.type).toBe('hosted');
		expect(mode.kind).toBe('hosted');
		expect(mode.projectUrl).toBe('/api/inth');
		expect(selectedMode({ projectUrl: '/api/inth' })).toBe(mode);
	});

	test('testing() selects its own transport, with or without a backend URL', () => {
		const mode = testing();
		expect(selectedMode({ mode, projectUrl: '/api/inth' })).toBe(
			mode.transport
		);
		expect(selectedMode({ mode })).toBe(mode.transport);
	});

	test('hosted() selects the hosted backend, as no mode does', () => {
		expect(selectedMode({ mode: hosted(), projectUrl: '/api/inth' })).toBe(
			selectedMode({ projectUrl: '/api/inth' })
		);
	});

	test('nothing is selected without a backend URL or testing()', () => {
		expect(selectedMode({})).toBeUndefined();
		expect(selectedMode({ mode: hosted() })).toBeUndefined();
	});

	test('the hosted backend builds with the builder the engine hands over', () => {
		const transport = { init: vi.fn() };
		const build = vi.fn(() => transport);
		provideModeTransports({ hosted: build });
		const mode = hostedFor('/api/handed-over');
		expect(mode({} as never)).toBe(transport);
		expect(build).toHaveBeenCalledWith(
			expect.objectContaining({ projectUrl: '/api/handed-over' })
		);
	});

	test('manifest() carries the kind and options core reads', () => {
		const fromManifest = manifest({
			manifestUrl: '/api/inth/manifest',
		}) as unknown as { kind: string; manifestUrl: string };
		expect(fromManifest.kind).toBe('manifest');
		expect(fromManifest.manifestUrl).toBe('/api/inth/manifest');
	});

	// Every transport loads its code on first use. A failed chunk request
	// must not stick: the next call loads it again.
	test.each([
		[
			'hosted',
			'@inth/sdk/transports',
			(init: () => unknown) => ({ createHostedTransport: () => ({ init }) }),
			() => hostedFor('/api/chunk'),
		],
		[
			'manifest',
			'@inth/sdk/transports/manifest-browser',
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
