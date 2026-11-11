/**
 * Headless TCF: the committed TC String reaches JavaScript, the web-named hooks
 * read the staged selection, and a save is one complete IAB commit pinned to
 * the revision it was made against.
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

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

/**
 * What native Accept all saves for {@link GVL} under this publisher: partner 9's
 * purpose 7 is restricted to consent, so it moves from legitimate interest. A
 * selection a raw-GVL reading would never produce, which is the point.
 */
const NATIVE_ACCEPT_ALL: NativeIABChoices = {
	...COMMITTED,
	adTechProviderConsents: null,
	purposeConsents: [1, 3, 7],
	purposeLegitimateInterests: [2],
	specialFeatureOptIns: [1],
	vendorConsents: [7, 9],
	vendorLegitimateInterests: [9],
};

const tcf = (overrides: Partial<ConsentSnapshot> = {}): ConsentSnapshot =>
	buildSnapshot({
		consentCategories: ['necessary', 'marketing'],
		iab: {
			acceptAll: NATIVE_ACCEPT_ALL,
			committed: { addtlConsent: null, choices: COMMITTED, tcString: 'CQ-1' },
			editable: true,
			gvl: GVL,
			headlessUnsupported: [],
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

	test('accept all stages what native Accept all saves, publisher restrictions included', () => {
		mount(tcf());

		flush(() => handle().acceptAll());

		expect(handle().choices).toEqual(NATIVE_ACCEPT_ALL);
		flush(() => handle().rejectAll());
		expect(handle().choices).toMatchObject({
			purposeConsents: [],
			purposeLegitimateInterests: [2],
			specialFeatureOptIns: [],
			vendorConsents: [],
		});
	});

	test('a first decision starts with disclosed legitimate interests on and consents off', () => {
		mount(
			tcf({
				iab: {
					acceptAll: NATIVE_ACCEPT_ALL,
					committed: null,
					editable: true,
					gvl: GVL,
					headlessUnsupported: [],
				},
			})
		);

		// As the stock presenter seeds it: no objection until the subject makes one.
		expect(handle().choices).toMatchObject({
			purposeConsents: [],
			purposeLegitimateInterests: NATIVE_ACCEPT_ALL.purposeLegitimateInterests,
			vendorConsents: [],
			vendorLegitimateInterests: NATIVE_ACCEPT_ALL.vendorLegitimateInterests,
		});
		expect(handle().isDirty).toBe(false);
	});

	test('blanket actions stage the categories with the TCF selection', async () => {
		mount(tcf());

		flush(() => handle().acceptAll());
		await handle().save();
		await flushPromises();
		flush(() => handle().rejectAll());
		await handle().save();
		await flushPromises();

		expect(
			fake.commitIntents.map((intent) => JSON.parse(intent).consents)
		).toEqual([{ marketing: true }, { marketing: false }]);
	});

	test('an edited selection is withdrawn when native can no longer open a draft', () => {
		mount(tcf());

		flush(() => handle().setVendorConsent(9, true));
		flush(() =>
			fake.pushSnapshot(
				tcf({
					iab: {
						acceptAll: null,
						committed: {
							addtlConsent: null,
							choices: COMMITTED,
							tcString: 'CQ-1',
						},
						editable: false,
						gvl: GVL,
						headlessUnsupported: [],
					},
					revision: 5,
				})
			)
		);

		expect(current().iab).toBeNull();
		expect(current().tcString).toBe('CQ-1');
	});

	test('a withdrawn selection comes back when native can open a draft again', () => {
		mount(tcf());
		const closed = tcf({
			iab: {
				acceptAll: null,
				committed: { addtlConsent: null, choices: COMMITTED, tcString: 'CQ-1' },
				editable: false,
				gvl: GVL,
				headlessUnsupported: [],
			},
			revision: 5,
		});

		flush(() => handle().setVendorConsent(9, true));
		flush(() => fake.pushSnapshot(closed));
		expect(current().iab).toBeNull();
		// The list is usable again, with the same decision underneath.
		flush(() => fake.pushSnapshot(tcf({ revision: 6 })));

		expect(handle().choices.vendorConsents).toContain(9);
		expect(handle().isDirty).toBe(true);
		expect(handle().isStale).toBe(false);
	});

	test('a withdrawn selection comes back stale when the decision moved meanwhile', () => {
		mount(tcf());

		flush(() => handle().setVendorConsent(9, true));
		flush(() =>
			fake.pushSnapshot(
				tcf({
					iab: {
						acceptAll: null,
						committed: null,
						editable: false,
						gvl: GVL,
						headlessUnsupported: [],
					},
					revision: 5,
				})
			)
		);
		flush(() =>
			fake.pushSnapshot(
				tcf({
					iab: {
						acceptAll: NATIVE_ACCEPT_ALL,
						committed: {
							addtlConsent: null,
							choices: NATIVE_ACCEPT_ALL,
							tcString: 'CQ-2',
						},
						editable: true,
						gvl: GVL,
						headlessUnsupported: [],
					},
					revision: 6,
				})
			)
		);

		// Saving would overwrite a decision made elsewhere, so the handle is back
		// for a review and `reset` takes the newer decision.
		expect(handle().isStale).toBe(true);
		flush(() => handle().reset());
		expect(handle().isStale).toBe(false);
		expect(handle().choices).toMatchObject({
			vendorConsents: NATIVE_ACCEPT_ALL.vendorConsents,
		});
	});

	test('an IAB edit made while the save is pending stays staged', async () => {
		mount(tcf());

		flush(() => handle().setVendorConsent(9, true));
		const saving = handle().save();
		flush(() => handle().setPurposeConsent(3, true));
		await saving;
		await flushPromises();

		expect(handle().choices.purposeConsents).toEqual([1, 3]);
		expect(handle().isDirty).toBe(true);
	});

	test('an IAB edit made while the save is pending survives a core that records the save', async () => {
		mount(tcf());
		// As both cores do: the commit is applied, the committed decision moves and a
		// change event goes out, and only then does the reply reach JavaScript.
		vi.mocked(fake.commit).mockImplementation((raw: string) => {
			fake.commitIntents.push(raw);
			const intent = JSON.parse(raw) as { choices: NativeIABChoices };
			fake.pushSnapshot(
				tcf({
					iab: {
						acceptAll: NATIVE_ACCEPT_ALL,
						committed: {
							addtlConsent: null,
							choices: intent.choices,
							tcString: 'CQ-2',
						},
						editable: true,
						gvl: GVL,
						headlessUnsupported: [],
					},
					revision: 5,
				})
			);
			return Promise.resolve(
				JSON.stringify({
					confirmed: [],
					ok: true,
					queued: true,
					revision: 5,
					subjectId: 'sub-1',
				})
			);
		});

		flush(() => handle().setVendorConsent(9, true));
		const saving = handle().save();
		flush(() => handle().setPurposeConsent(3, true));
		await saving;
		await flushPromises();

		// The save's own write is not a decision made elsewhere.
		expect(handle().isStale).toBe(false);
		expect(handle().choices.purposeConsents).toEqual([1, 3]);
		expect(handle().isDirty).toBe(true);
	});

	test('an IAB edit made while the save is pending turns stale when another decision lands after the save', async () => {
		mount(tcf());
		vi.mocked(fake.commit).mockImplementation((raw: string) => {
			fake.commitIntents.push(raw);
			const intent = JSON.parse(raw) as { choices: NativeIABChoices };
			const committed = (choices: NativeIABChoices, revision: number) =>
				tcf({
					iab: {
						acceptAll: NATIVE_ACCEPT_ALL,
						committed: { addtlConsent: null, choices, tcString: 'CQ-2' },
						editable: true,
						gvl: GVL,
						headlessUnsupported: [],
					},
					revision,
				});
			fake.pushSnapshot(committed(intent.choices, 5));
			// Another screen commits a different TCF decision before the reply arrives.
			fake.pushSnapshot(committed(NATIVE_ACCEPT_ALL, 6));
			return Promise.resolve(
				JSON.stringify({
					confirmed: [],
					ok: true,
					queued: true,
					revision: 5,
					subjectId: 'sub-1',
				})
			);
		});

		flush(() => handle().setVendorConsent(9, true));
		const saving = handle().save();
		flush(() => handle().setPurposeConsent(3, true));
		await saving;
		await flushPromises();

		expect(handle().isStale).toBe(true);
	});

	test('an IAB edit withdrawn while the save settles comes back when editing returns', async () => {
		mount(tcf());
		const slot = (
			choices: NativeIABChoices,
			editable: boolean
		): ConsentSnapshot['iab'] => ({
			acceptAll: editable ? NATIVE_ACCEPT_ALL : null,
			committed: { addtlConsent: null, choices, tcString: 'CQ-2' },
			editable,
			gvl: GVL,
			headlessUnsupported: [],
		});
		let saved: NativeIABChoices = COMMITTED;
		let reply: () => void = () => undefined;
		// The save lands at revision 5; its reply arrives when the test says so.
		vi.mocked(fake.commit).mockImplementation((raw: string) => {
			fake.commitIntents.push(raw);
			saved = (JSON.parse(raw) as { choices: NativeIABChoices }).choices;
			fake.pushSnapshot(tcf({ iab: slot(saved, true), revision: 5 }));
			return new Promise((resolve) => {
				reply = () =>
					resolve(
						JSON.stringify({
							confirmed: [],
							ok: true,
							queued: true,
							revision: 5,
							subjectId: 'sub-1',
						})
					);
			});
		});

		flush(() => handle().setVendorConsent(9, true));
		const saving = handle().save();
		flush(() => handle().setPurposeConsent(3, true));
		// Then the list stops being editable, before the reply.
		flush(() =>
			fake.pushSnapshot(tcf({ iab: slot(saved, false), revision: 6 }))
		);
		reply();
		await saving;
		await flushPromises();
		expect(current().iab).toBeNull();

		// Editing returns. The edit is handed back, for review: something landed
		// after the save, so it may have been made over a newer decision.
		flush(() =>
			fake.pushSnapshot(tcf({ iab: slot(saved, true), revision: 7 }))
		);
		expect(handle().choices.purposeConsents).toEqual([1, 3]);
		expect(handle().isStale).toBe(true);
		flush(() => handle().reset());
		expect(handle().isStale).toBe(false);
		expect(handle().choices.purposeConsents).toEqual(saved.purposeConsents);
	});

	test('offer no edits while native cannot open a draft', () => {
		mount(
			tcf({
				iab: {
					acceptAll: null,
					committed: {
						addtlConsent: null,
						choices: COMMITTED,
						tcString: 'CQ-1',
					},
					editable: false,
					gvl: GVL,
					headlessUnsupported: [],
				},
			})
		);

		// The list is stale or offline: the committed decision still shows.
		expect(current().iab).toBeNull();
		expect(current().tcString).toBe('CQ-1');
	});

	test('offer no edits while a custom screen could not disclose everything', () => {
		// Native could open a draft, but the publisher restricts legal bases, which
		// the served list does not show.
		mount(
			tcf({
				iab: {
					acceptAll: NATIVE_ACCEPT_ALL,
					committed: {
						addtlConsent: null,
						choices: COMMITTED,
						tcString: 'CQ-1',
					},
					editable: true,
					gvl: GVL,
					headlessUnsupported: ['publisher-restrictions'],
				},
			})
		);

		expect(current().iab).toBeNull();
		expect(current().tcString).toBe('CQ-1');
	});

	test('treat a bridge without the headless fields as unable to edit', async () => {
		// A JavaScript-only update over a binary from before the headless IAB bridge:
		// its `iab` object carries the list and nothing else.
		const older = tcf();
		mount({ ...older, iab: { gvl: GVL } as ConsentSnapshot['iab'] });

		expect(current().enabled).toBe(true);
		expect(current().iab).toBeNull();
		expect(current().tcString).toBeNull();
		await current().save();
		await flushPromises();
		expect(JSON.parse(fake.commitIntents[0] ?? '{}').action).toBe('explicit');
	});

	test('a decision committed elsewhere under an edited selection makes the draft stale', async () => {
		mount(tcf());

		flush(() => handle().setVendorConsent(9, true));
		flush(() =>
			fake.pushSnapshot(
				tcf({
					iab: {
						acceptAll: NATIVE_ACCEPT_ALL,
						committed: {
							addtlConsent: null,
							choices: { ...COMMITTED, vendorConsents: [] },
							tcString: 'CQ-2',
						},
						editable: true,
						gvl: GVL,
						headlessUnsupported: [],
					},
					revision: 5,
				})
			)
		);

		expect(handle().isStale).toBe(true);
		const refused = await handle().save();
		expect(refused.reason).toBe('concurrent-change');
		expect(fake.commit).not.toHaveBeenCalled();
	});

	test('an untouched selection takes a decision committed elsewhere, and the save pins its revision', async () => {
		mount(tcf());

		flush(() =>
			fake.pushSnapshot(
				tcf({
					iab: {
						acceptAll: NATIVE_ACCEPT_ALL,
						committed: {
							addtlConsent: null,
							choices: { ...COMMITTED, vendorConsents: [] },
							tcString: 'CQ-2',
						},
						editable: true,
						gvl: GVL,
						headlessUnsupported: [],
					},
					revision: 5,
				})
			)
		);

		expect(current().vendor7).toBe(false);
		expect(handle().isStale).toBe(false);
		await handle().save();
		await flushPromises();
		expect(JSON.parse(fake.commitIntents[0] ?? '{}')).toMatchObject({
			action: 'iab',
			choices: { vendorConsents: [] },
			revision: 5,
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
					iab: {
						acceptAll: NATIVE_ACCEPT_ALL,
						committed: null,
						editable: true,
						gvl: { ...GVL, vendorListVersion: 178 },
						headlessUnsupported: [],
					},
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
