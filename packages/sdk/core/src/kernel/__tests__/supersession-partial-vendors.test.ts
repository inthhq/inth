/**
 * Under an account layer a save sends only the vendors it decided, so a
 * newer save that decides the same categories can still leave some of an
 * older save's vendors undecided. Those vendors stay in the replay.
 */
import { describe, expect, test } from 'vitest';

import type { SavePayload } from '../../consent-kernel.model';
import { withoutSuperseded } from '../save-outbox/supersession.model';

const receipt = (value: boolean) => ({
	basis: { fingerprint: 'choice-fp', kind: 'choice-v1' as const },
	confirmedAt: 1000,
	value,
});

const marketingWithVendorA: SavePayload = {
	choice: { categories: { marketing: receipt(true) }, version: 3 },
	confirmed: { actionAt: 1000, categories: { marketing: true } },
	consentAction: 'custom',
	consents: {
		experience: false,
		functionality: false,
		marketing: true,
		measurement: false,
		necessary: true,
	},
	idempotencyKey: '0193e5a8-7c1e-7b7a-9d7e-2f0c9a3b4d5f',
	model: 'opt-in',
	overrides: {},
	policySnapshotToken: null,
	subject: { subjectId: 'sub_test' },
	subjectId: 'sub_test',
	tcString: null,
	uiSource: 'banner',
	user: null,
	vendorChoice: { confirmedAt: 1000, grants: { vendor_a: true }, version: 1 },
};

const marketingDecidedAgain = (category: string) => category === 'marketing';

describe('supersession: partial vendor maps', () => {
	test('a newer save that decides the same categories keeps the vendors it did not decide', () => {
		const replay = withoutSuperseded(marketingWithVendorA, {
			category: marketingDecidedAgain,
			vendor: (id) => id === 'vendor_b',
		});
		expect(replay?.confirmed.categories).toEqual({});
		expect(replay?.vendorChoice?.grants).toEqual({ vendor_a: true });
	});

	test('a save whose categories and vendors were all decided again goes', () => {
		expect(
			withoutSuperseded(marketingWithVendorA, {
				category: marketingDecidedAgain,
				vendor: (id) => id === 'vendor_a',
			})
		).toBeNull();
	});

	test('a save without vendors whose categories were all decided again goes', () => {
		const { vendorChoice: _vendors, ...categoriesOnly } = marketingWithVendorA;
		expect(
			withoutSuperseded(categoriesOnly, {
				category: marketingDecidedAgain,
				vendor: () => false,
			})
		).toBeNull();
	});
});
