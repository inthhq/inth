/** @vitest-environment jsdom */
/**
 * The one rule every deferred root reads to decide whether the engine may
 * load after the page for a visitor the banner asks.
 */
import { describe, expect, test } from 'vite-plus/test';

import {
	matchedResolution,
	NOW,
	optInRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type { ConsentSnapshot } from '../../consent-kernel.model';
import { createKernel } from '../../kernel/index';
import { createMemoryOutboxStore } from '../../kernel/save-outbox/save-outbox.store';
import type { Script } from '../../libs/script-loader/script.model';
import { canDeferEngine } from '../can-defer-engine';
import { awaitsChoice } from '../plain-scripts';

const asking = (): ConsentSnapshot =>
	createKernel(
		{
			consentCategories: ['necessary', 'measurement', 'marketing'],
			initialPolicyResolution: matchedResolution(
				optInRule({ categories: ['measurement', 'marketing'] })
			),
			now: NOW,
		},
		{ outboxStore: createMemoryOutboxStore() }
	).getSnapshot();

describe('canDeferEngine', () => {
	test('a fresh visitor the opt-in banner asks can wait for the engine', () => {
		expect(asking().activeUI).toBe('banner');
		expect(canDeferEngine(asking(), {}, NOW)).toBe(true);
	});

	test('an external CMP’s permissions need the engine', () => {
		const snapshot = { ...asking(), externalPermissions: {} } as never;
		expect(awaitsChoice(snapshot)).toBe(false);
		expect(canDeferEngine(snapshot, {}, NOW)).toBe(false);
	});

	test('options the engine applies at once keep it from waiting', () => {
		const snapshot = asking();
		for (const options of [
			{ enabled: false },
			{ persistence: false },
			{ consentSource: {} },
			{ gpp: true },
			{ iab: {} },
			{ networkBlocker: {} },
		]) {
			expect(canDeferEngine(snapshot, options, NOW)).toBe(false);
		}
		expect(canDeferEngine(snapshot, { iab: { enabled: false } }, NOW)).toBe(
			true
		);
	});

	test('a necessary script waits unless the server starts it', () => {
		const snapshot = asking();
		const started: Script = {
			category: 'necessary',
			id: 'started',
			serverStart: () => undefined,
			src: '/n.js',
		};
		expect(canDeferEngine(snapshot, { scripts: [started] }, NOW)).toBe(true);
		expect(
			canDeferEngine(
				snapshot,
				{ scriptLoader: { serverStart: false }, scripts: [started] },
				NOW
			)
		).toBe(false);
		expect(
			canDeferEngine(
				snapshot,
				{ scripts: [{ ...started, serverStart: undefined }] },
				NOW
			)
		).toBe(false);
	});
});
