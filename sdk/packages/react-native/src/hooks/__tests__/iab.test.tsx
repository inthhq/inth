/**
 * Headless TCF: the committed TC String reaches JavaScript, the web-named hooks
 * read the staged selection, and a save is one complete IAB commit pinned to
 * the revision it was made against.
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { afterEach, describe, expect, test } from 'vitest';

import {
	buildSnapshot,
	createFakeNativeModule,
	flush,
	flushPromises,
	renderTree,
} from '../../__tests__/helpers/fake-native';
import type {
	FakeNativeModule,
	RenderHandle,
} from '../../__tests__/helpers/fake-native';
import { resetNativeStub } from '../../__tests__/helpers/react-native-stub';
import { resetConsentClient } from '../../native/client';
import type {
	ConsentSnapshot,
	GlobalVendorList,
	NativeIABChoices,
} from '../../protocol';
import { ConsentProvider } from '../../provider/consent-provider';
import { useSaveConsents } from '../use-consent-actions';
import type { IABDraftHandle } from '../use-iab';
import {
	useIAB,
	useIABEnabled,
	usePurposeConsent,
	useSpecialFeatureOptIn,
	useTCString,
	useVendorConsent,
} from '../use-iab';

/** Two partners: one on consent with a geolocation feature, one on LI. */
const GVL = {
	features: {},
	gvlSpecificationVersion: 3,
	lastUpdated: '2026-11-01T00:00:00Z',
	purposes: {},
	specialFeatures: {},
	specialPurposes: {},
	stacks: {},
	tcfPolicyVersion: 5,
	vendorListVersion: 177,
	vendors: {
		'11': {
			deletedDate: '2026-01-01',
			features: [],
			flexiblePurposes: [],
			id: 11,
			legIntPurposes: [],
			name: 'Withdrawn',
			purposes: [10],
			specialFeatures: [2],
			specialPurposes: [],
		},
		'7': {
			features: [],
			flexiblePurposes: [],
			id: 7,
			legIntPurposes: [],
			name: 'Seven',
			purposes: [1, 3],
			specialFeatures: [1],
			specialPurposes: [],
		},
		'9': {
			features: [],
			flexiblePurposes: [],
			id: 9,
			legIntPurposes: [2, 4, 7],
			name: 'Nine',
			purposes: [],
			specialFeatures: [],
			specialPurposes: [],
		},
	},
} as unknown as GlobalVendorList;

const COMMITTED: NativeIABChoices = {
	publisherConsents: [],
	publisherCustomConsents: [],
	publisherCustomLegitimateInterests: [],
	publisherLegitimateInterests: [],
	purposeConsents: [1],
	purposeLegitimateInterests: [],
	purposeObjections: [],
	specialFeatureOptIns: [],
	vendorConsents: [7],
	vendorLegitimateInterests: [],
	vendorObjections: [],
};

const tcf = (overrides: Partial<ConsentSnapshot> = {}): ConsentSnapshot =>
	buildSnapshot({
		consentCategories: ['necessary', 'marketing'],
		iab: {
			committed: { addtlConsent: null, choices: COMMITTED, tcString: 'CQ-1' },
			gvl: GVL,
		},
		model: 'iab',
		resolution: { fingerprint: 'fp', policyId: 'tcf', status: 'match' },
		revision: 4,
		...overrides,
	});

let fake: FakeNativeModule;
let latest: {
	iab: IABDraftHandle | null;
	enabled: boolean;
	tcString: string | null;
	vendor7: boolean;
	purpose1: boolean;
	feature1: boolean;
	save: ReturnType<typeof useSaveConsents>;
} | null = null;

const Probe = (): ReactNode => {
	const value = {
		enabled: useIABEnabled(),
		feature1: useSpecialFeatureOptIn(1),
		iab: useIAB(),
		purpose1: usePurposeConsent(1),
		save: useSaveConsents(),
		tcString: useTCString(),
		vendor7: useVendorConsent('7'),
	};
	useEffect(() => {
		latest = value;
	});
	return null;
};

const current = function current(): NonNullable<typeof latest> {
	if (latest === null) {
		throw new Error('the probe never rendered');
	}
	return latest;
};

const handle = function handle(): IABDraftHandle {
	const { iab } = current();
	if (iab === null) {
		throw new Error('no IAB draft');
	}
	return iab;
};

const mount = function mount(snapshot: ConsentSnapshot): RenderHandle {
	fake = createFakeNativeModule({ snapshot });
	return renderTree(
		<ConsentProvider>
			<Probe />
		</ConsentProvider>
	);
};

afterEach(() => {
	latest = null;
	resetConsentClient();
	resetNativeStub();
});

describe('headless IAB hooks', () => {
	test('read the committed decision and seed the selection from it', () => {
		mount(tcf());

		expect(current().enabled).toBe(true);
		expect(current().tcString).toBe('CQ-1');
		expect(current().vendor7).toBe(true);
		expect(current().purpose1).toBe(true);
		expect(current().feature1).toBe(false);
		expect(handle().isDirty).toBe(false);
	});

	test('are inert outside TCF', () => {
		mount(buildSnapshot());

		expect(current().enabled).toBe(false);
		expect(current().iab).toBeNull();
		expect(current().tcString).toBeNull();
		expect(current().vendor7).toBe(false);
	});

	test('save one complete IAB commit pinned to the revision it was made against', async () => {
		mount(tcf());

		flush(() => handle().setVendorConsent(9, true));
		flush(() => handle().setSpecialFeatureOptIn(1, true));
		flush(() => handle().setPurposeConsent(1, false));

		expect(current().purpose1).toBe(false);
		expect(current().feature1).toBe(true);
		expect(handle().isDirty).toBe(true);
		expect(fake.commit).not.toHaveBeenCalled();

		await current().save();
		await flushPromises();

		expect(fake.commitIntents).toHaveLength(1);
		expect(JSON.parse(fake.commitIntents[0] ?? '')).toEqual({
			action: 'iab',
			choices: {
				...COMMITTED,
				adTechProviderConsents: null,
				purposeConsents: [],
				specialFeatureOptIns: [1],
				vendorConsents: [7, 9],
			},
			consents: { marketing: false },
			revision: 4,
		});
	});

	test('accept all stages what the live partners declare, and nothing else', () => {
		mount(tcf());

		flush(() => handle().acceptAll());

		expect(handle().choices).toMatchObject({
			// Purpose 4 is never a legitimate-interest purpose.
			purposeConsents: [1, 3],
			purposeLegitimateInterests: [2, 7],
			specialFeatureOptIns: [1],
			vendorConsents: [7],
			vendorLegitimateInterests: [9],
		});
		flush(() => handle().rejectAll());
		expect(handle().choices).toMatchObject({
			purposeConsents: [],
			purposeLegitimateInterests: [2, 7],
			specialFeatureOptIns: [],
			vendorConsents: [],
		});
	});

	test('legitimate interest toggles its objection, and refuses purposes TCF forbids', () => {
		mount(tcf());

		flush(() => handle().setPurposeLegitimateInterest(1, true));
		expect(handle().choices.purposeLegitimateInterests).toEqual([]);
		flush(() => handle().setVendorLegitimateInterest(9, false));
		expect(handle().choices.vendorObjections).toEqual([9]);
		flush(() => handle().setVendorLegitimateInterest(9, true));
		expect(handle().choices).toMatchObject({
			vendorLegitimateInterests: [9],
			vendorObjections: [],
		});
	});

	test('a new vendor list under an unsaved edit makes the draft stale', async () => {
		mount(tcf());

		flush(() => handle().setVendorConsent(9, true));
		flush(() =>
			fake.pushSnapshot(
				tcf({
					iab: { committed: null, gvl: { ...GVL, vendorListVersion: 178 } },
					revision: 5,
				})
			)
		);

		expect(handle().isStale).toBe(true);
		const refused = await handle().save();
		expect(refused.reason).toBe('concurrent-change');
		expect(fake.commit).not.toHaveBeenCalled();
	});
});
