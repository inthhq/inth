/**
 * The reload that recovers a consent chunk Chromium keeps as failed, and
 * the choice it carries to the reloaded page. The built-site journey is
 * in `chunk-recovery.test.ts`.
 */
import type { ConsentSnapshot } from '@inth/sdk/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	choiceFromTaps,
	failedChunkUrl,
	recoverChunkLoad,
	replayPendingChoice,
	setPageReloadForTest,
	takePendingChoice,
} from '../browser/recover-chunk-load';

const CHUNK = 'https://example.com/_astro/engine.abc.js';
const CHROMIUM = new TypeError(
	`Failed to fetch dynamically imported module: ${CHUNK}`
);

let reload: ReturnType<typeof vi.fn>;
let probe: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	sessionStorage.clear();
	reload = vi.fn();
	setPageReloadForTest(reload);
	probe = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(new Response(null, { status: 200 }));
});

afterEach(() => {
	setPageReloadForTest();
	vi.restoreAllMocks();
	vi.useRealTimers();
	sessionStorage.clear();
});

describe('failedChunkUrl', () => {
	it('reads the chunk Chromium and Firefox name', () => {
		expect(failedChunkUrl(CHROMIUM)?.href).toBe(CHUNK);
		expect(
			failedChunkUrl(
				new TypeError(`error loading dynamically imported module: ${CHUNK}`)
			)?.href
		).toBe(CHUNK);
	});

	it('names nothing for WebKit, or for an error that is not a download', () => {
		expect(
			failedChunkUrl(new TypeError('Importing a module script failed.'))
		).toBeNull();
		expect(failedChunkUrl(new Error(`boom at ${CHUNK}`))).toBeNull();
	});
});

describe('recoverChunkLoad', () => {
	it('reloads once the chunk answers, keeping the choice for this page', async () => {
		expect(await recoverChunkLoad(CHROMIUM, 'all')).toBe(true);
		expect(probe).toHaveBeenCalledWith(
			new URL(CHUNK),
			expect.objectContaining({ cache: 'no-store', method: 'HEAD' })
		);
		expect(reload).toHaveBeenCalledOnce();
		expect(takePendingChoice()).toBe('all');
		// Taken once.
		expect(takePendingChoice()).toBeNull();
	});

	it('does not reload again soon after a reload it started', async () => {
		await recoverChunkLoad(CHROMIUM, 'all');
		expect(await recoverChunkLoad(CHROMIUM, 'none')).toBe(false);
		expect(reload).toHaveBeenCalledOnce();
	});

	it('does not reload while the chunk still fails, offline, or for WebKit', async () => {
		probe.mockResolvedValueOnce(new Response(null, { status: 503 }));
		expect(await recoverChunkLoad(CHROMIUM, 'all')).toBe(false);
		probe.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		expect(await recoverChunkLoad(CHROMIUM, 'all')).toBe(false);
		vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
		expect(await recoverChunkLoad(CHROMIUM, 'all')).toBe(false);
		vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
		expect(
			await recoverChunkLoad(
				new TypeError('Importing a module script failed.'),
				'all'
			)
		).toBe(false);
		expect(reload).not.toHaveBeenCalled();
		expect(takePendingChoice()).toBeNull();
	});
});

describe('takePendingChoice', () => {
	const keep = (value: unknown): void => {
		sessionStorage.setItem('inth:astro:pending-choice', JSON.stringify(value));
	};

	it('drops a choice kept for another page, too long ago, or malformed', () => {
		const at = Date.now();
		keep({ at, choice: 'all', path: '/other' });
		expect(takePendingChoice()).toBeNull();
		keep({ at: at - 60_000, choice: 'all', path: location.pathname });
		expect(takePendingChoice()).toBeNull();
		keep({ at, choice: { marketing: 'yes' }, path: location.pathname });
		expect(takePendingChoice()).toBeNull();
		keep({ at, choice: { marketing: false }, path: location.pathname });
		expect(takePendingChoice()).toEqual({ marketing: false });
	});
});

describe('choiceFromTaps', () => {
	it('is the last accept or reject the early-tap script holds', () => {
		const tap = (action: 'accept' | 'reject' | 'customize') => ({
			action,
			at: 1,
			model: null,
			prompt: null,
		});
		expect(choiceFromTaps([tap('accept'), tap('reject')])).toBe('none');
		expect(choiceFromTaps([tap('accept'), tap('customize')])).toBe('all');
		expect(choiceFromTaps([tap('customize')])).toBeNull();
		expect(choiceFromTaps(undefined)).toBeNull();
	});
});

describe('replayPendingChoice', () => {
	const target = (snapshot: Partial<ConsentSnapshot>) => {
		let listener: ((next: ConsentSnapshot) => void) | undefined;
		return {
			acceptAll: vi.fn(() => Promise.resolve()),
			emit(next: Partial<ConsentSnapshot>) {
				listener?.(next as ConsentSnapshot);
			},
			getConsent: () => snapshot as ConsentSnapshot,
			rejectAll: vi.fn(() => Promise.resolve()),
			save: vi.fn(() => Promise.resolve()),
			subscribe(next: (value: ConsentSnapshot) => void) {
				listener = next;
				return () => {
					listener = undefined;
				};
			},
		};
	};

	it('applies the kept choice once the policy resolves with the banner', async () => {
		await recoverChunkLoad(CHROMIUM, 'none');
		const client = target({ activeUI: 'none', policyPending: true });
		replayPendingChoice(client);
		expect(client.rejectAll).not.toHaveBeenCalled();
		client.emit({ activeUI: 'banner', policyPending: false });
		expect(client.rejectAll).toHaveBeenCalledOnce();
		client.emit({ activeUI: 'banner', policyPending: false });
		expect(client.rejectAll).toHaveBeenCalledOnce();
	});

	it('drops it when the reloaded page asks for no choice', async () => {
		await recoverChunkLoad(CHROMIUM, 'all');
		const client = target({ activeUI: 'none', policyPending: false });
		replayPendingChoice(client);
		expect(client.acceptAll).not.toHaveBeenCalled();
		expect(takePendingChoice()).toBeNull();
	});
});
