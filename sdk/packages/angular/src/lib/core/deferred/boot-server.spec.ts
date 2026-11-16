import type { ConsentSnapshot } from '@c15t/core';
import { pendingBootSnapshot } from '@c15t/core/surface-state';
import { describe, expect, test } from 'vitest';

import { canDeferEngine } from './boot-server';

const answered = (): ConsentSnapshot =>
	({
		...pendingBootSnapshot({}),
		activeUI: 'none',
		effectivePermissions: {
			...pendingBootSnapshot({}).effectivePermissions,
			measurement: true,
		},
		policyPending: false,
		resolution: { policy: null, status: 'matched' },
	}) as unknown as ConsentSnapshot;

const plain = { category: 'measurement', id: 'measure', src: '/m.js' } as const;

describe('canDeferEngine for a visitor with nothing to answer', () => {
	test('waits when every allowed script is a plain one the page starts', () => {
		expect(canDeferEngine(answered(), { scripts: [plain] })).toBe(true);
	});

	test('loads at once when an allowed script needs the loader', () => {
		expect(
			canDeferEngine(answered(), {
				scripts: [{ ...plain, onLoad: () => undefined }],
			})
		).toBe(false);
	});

	test('loads at once for IAB and the network blocker', () => {
		expect(canDeferEngine(answered(), { iab: { cmpId: 28 } })).toBe(false);
		expect(canDeferEngine(answered(), { networkBlocker: { rules: [] } })).toBe(
			false
		);
	});
});
