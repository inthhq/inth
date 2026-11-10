/**
 * The draft a custom preference screen stages into: nothing reaches native
 * until save, one save records every displayed category, and a policy change
 * under an unsaved edit can never be confirmed.
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
import { useSaveConsents } from '../../hooks/use-consent-actions';
import { resetConsentClient } from '../../native/client';
import type { ConsentSnapshot } from '../../protocol';
import { ConsentProvider } from '../../provider/consent-provider';
import {
	ConsentDraftProvider,
	useConsentDraft,
} from '../consent-draft-provider';
import type { ConsentDraftHandle } from '../consent-draft-provider';

let fake: FakeNativeModule;
const seen = new Map<string, ConsentDraftHandle>();
let save: ReturnType<typeof useSaveConsents> | undefined;

/** Publishes the latest handle a probe rendered with. */
const DraftProbe = ({ name }: { readonly name: string }): ReactNode => {
	const draft = useConsentDraft();
	useEffect(() => {
		seen.set(name, draft);
	});
	return <span>{JSON.stringify(draft.values)}</span>;
};

/** Publishes the save command a separate button would hold. */
const SaveProbe = (): ReactNode => {
	const saveConsents = useSaveConsents();
	useEffect(() => {
		save = saveConsents;
	});
	return null;
};

const handle = function handle(name: string): ConsentDraftHandle {
	const draft = seen.get(name);
	if (draft === undefined) {
		throw new Error(`probe ${name} never rendered`);
	}
	return draft;
};

const mount = function mount(
	children: ReactNode,
	snapshot: ConsentSnapshot
): RenderHandle {
	fake = createFakeNativeModule({ snapshot });
	return renderTree(<ConsentProvider>{children}</ConsentProvider>);
};

/** An EU opt-in scope with marketing and measurement shown. */
const scoped = (overrides: Partial<ConsentSnapshot> = {}): ConsentSnapshot =>
	buildSnapshot({
		consentCategories: ['necessary', 'measurement', 'marketing'],
		resolution: { fingerprint: 'fp-1', policyId: 'eu', status: 'match' },
		...overrides,
	});

afterEach(() => {
	seen.clear();
	save = undefined;
	resetConsentClient();
	resetNativeStub();
});

describe('useConsentDraft', () => {
	test('stages edits in JavaScript and saves every displayed category once', async () => {
		mount(<DraftProbe name="screen" />, scoped());

		expect(handle('screen').displayedCategories).toEqual([
			'necessary',
			'measurement',
			'marketing',
		]);
		flush(() => handle('screen').set('marketing', true));
		flush(() => handle('screen').set('necessary', false));

		expect(fake.commit).not.toHaveBeenCalled();
		expect(handle('screen').isDirty).toBe(true);
		expect(handle('screen').values.necessary).toBe(true);

		const result = await handle('screen').save();
		await flushPromises();

		expect(result.ok).toBe(true);
		expect(fake.commitIntents).toEqual([
			'{"action":"explicit","consents":{"measurement":false,"marketing":true}}',
		]);
	});

	test('seeds from saved receipts, not from masked effective permissions', () => {
		mount(
			<DraftProbe name="screen" />,
			scoped({
				// GPC masks marketing; the subject's own receipt still says yes.
				effectivePermissions: {
					experience: false,
					functionality: false,
					marketing: false,
					measurement: true,
					necessary: true,
				},
				explicitChoice: {
					categories: {
						marketing: {
							basis: { fingerprint: 'fp-1', kind: 'choice-v1' },
							confirmedAt: 1,
							value: true,
						},
					},
					version: 3,
				},
			})
		);

		expect(handle('screen').values.marketing).toBe(true);
		// No receipt: the effective permission is the starting point.
		expect(handle('screen').values.measurement).toBe(true);
		expect(handle('screen').isDirty).toBe(false);
	});

	test('accept and reject all stage only the displayed categories', () => {
		mount(<DraftProbe name="screen" />, scoped());

		flush(() => handle('screen').acceptAll());
		expect(handle('screen').values).toMatchObject({
			experience: false,
			functionality: true,
			marketing: true,
			measurement: true,
		});
		flush(() => handle('screen').rejectAll());
		expect(handle('screen').values).toMatchObject({
			marketing: false,
			measurement: false,
		});
		expect(fake.commit).not.toHaveBeenCalled();
	});

	test('follows the record while clean', () => {
		mount(<DraftProbe name="screen" />, scoped());

		flush(() =>
			fake.pushSnapshot(
				scoped({
					explicitChoice: {
						categories: {
							measurement: {
								basis: { fingerprint: 'fp-1', kind: 'choice-v1' },
								confirmedAt: 2,
								value: true,
							},
						},
						version: 3,
					},
					revision: 1,
				})
			)
		);

		expect(handle('screen').values.measurement).toBe(true);
		expect(handle('screen').isDirty).toBe(false);
	});

	test('turns stale when the policy changes under an edit, and refuses to save it', async () => {
		mount(<DraftProbe name="screen" />, scoped());

		flush(() => handle('screen').set('marketing', true));
		flush(() =>
			fake.pushSnapshot(
				scoped({
					resolution: { fingerprint: 'fp-2', policyId: 'eu', status: 'match' },
					revision: 1,
				})
			)
		);

		expect(handle('screen').isStale).toBe(true);
		const refused = await handle('screen').save();
		expect(refused).toMatchObject({ ok: false, reason: 'concurrent-change' });
		expect(fake.commit).not.toHaveBeenCalled();

		flush(() => handle('screen').reset());
		expect(handle('screen').isStale).toBe(false);
		expect(handle('screen').values.marketing).toBe(false);
	});

	test('components outside a provider share one draft, and a bare useSaveConsents() saves it', async () => {
		mount(
			<>
				<DraftProbe name="rows" />
				<DraftProbe name="summary" />
				<SaveProbe />
			</>,
			scoped()
		);

		flush(() => handle('rows').set('measurement', true));
		expect(handle('summary').values.measurement).toBe(true);

		await save?.();
		await flushPromises();

		expect(fake.commitIntents).toEqual([
			'{"action":"explicit","consents":{"measurement":true,"marketing":false}}',
		]);
	});

	test('a provider keeps its own draft, with defaults for categories without a receipt', async () => {
		mount(
			<>
				<DraftProbe name="outside" />
				<ConsentDraftProvider initial={{ marketing: true }}>
					<DraftProbe name="inside" />
					<SaveProbe />
				</ConsentDraftProvider>
			</>,
			scoped()
		);

		expect(handle('inside').values.marketing).toBe(true);
		expect(handle('outside').values.marketing).toBe(false);
		flush(() => handle('inside').set('measurement', true));
		expect(handle('outside').values.measurement).toBe(false);

		await save?.();
		await flushPromises();

		expect(fake.commitIntents).toEqual([
			'{"action":"explicit","consents":{"measurement":true,"marketing":true}}',
		]);
	});

	test('an argument still saves exactly that choice', async () => {
		mount(<SaveProbe />, scoped());

		await save?.('none');
		await flushPromises();

		expect(fake.commitIntents).toEqual(['{"action":"necessary"}']);
	});
});
