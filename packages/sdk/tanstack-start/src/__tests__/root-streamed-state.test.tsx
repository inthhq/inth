/**
 * InthProvider accepts the pending consent state a streamed root loader
 * returns (`loader: () => ({ consent: getConsentState() })`).
 *
 * Invariants verified:
 * - The server render with a pending state has no consent UI and grants
 *   nothing, and the first client render matches it.
 * - A resolved policy in the promise answers the first init: no init
 *   request, and the first save carries the decision the policy made, so
 *   the same-origin init route's decision assertion accepts it.
 * - A promise that resolves without a policy (the server gave up on the
 *   manifest) falls back to the init route.
 * - Legal documents go to the backend the resolved state names.
 */
import {
	useActiveUI,
	useConsent,
	useModel,
	useDocuments,
	useSaveConsents,
} from '@inth/react';
import type { RuntimeDocuments } from '@inth/react';
import { useEffect } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { InthProvider } from '../root';
import type { ConsentState } from '../server';
import { policyFixture } from './policy-fixture';

const Status = () => {
	const model = useModel();
	const activeUI = useActiveUI();
	const marketing = useConsent('marketing');
	return (
		<div data-testid="status">
			{`${model ?? 'pending'}/${activeUI}/${String(marketing)}`}
		</div>
	);
};

const SaveButton = () => {
	const save = useSaveConsents();
	return (
		<button
			data-testid="save"
			onClick={() => {
				void save({ marketing: true }).catch(() => undefined);
			}}
			type="button"
		>
			save
		</button>
	);
};

const deferred = function deferred() {
	let settle: (state: ConsentState) => void = () => undefined;
	const promise = new Promise<ConsentState>((resolve) => {
		settle = resolve;
	});
	return { promise, resolve: settle };
};

// The server function's config, as `createConsentStateHandler({
// routePrefix: '/api/inth', proxy: true })` puts it on the state.
const sameOrigin = { projectUrl: '/api/inth', routePrefix: '/api/inth' };

const initResponse = () =>
	Response.json({
		branding: 'inth',
		location: { countryCode: 'DE', regionCode: null },
		translations: { language: 'en', translations: { common: {} } },
	});

let documents: RuntimeDocuments | undefined;
const DocumentsCapture = () => {
	const bound = useDocuments();
	useEffect(() => {
		documents = bound;
	}, [bound]);
	return null;
};

describe('InthProvider: streamed state', () => {
	test('the server render with a pending state shows no consent UI', async () => {
		const { renderToString } = await import('react-dom/server');
		const { promise } = deferred();
		const html = renderToString(
			<InthProvider
				persistence={false}
				state={promise}
			>
				<Status />
			</InthProvider>
		);
		expect(html).toContain('pending/none/false');
	});

	test('a resolved policy answers init and binds the first save', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(() =>
				Promise.resolve(Response.json({ ok: true, subjectId: 'sub_1' }))
			);
		const { promise, resolve: resolveState } = deferred();
		try {
			const { getByTestId } = await render(
				<InthProvider
					persistence={false}
					state={promise}
				>
					<Status />
					<SaveButton />
				</InthProvider>
			);

			await expect
				.element(getByTestId('status'))
				.toHaveTextContent('pending/none/false');

			resolveState({ ...policyFixture(), ...sameOrigin });
			await expect
				.element(getByTestId('status'))
				.toHaveTextContent('opt-in/banner/false');
			expect(fetchSpy).not.toHaveBeenCalled();

			await getByTestId('save').click();
			await vi.waitFor(() => {
				expect(fetchSpy).toHaveBeenCalledTimes(1);
			});
			const [url, init] = fetchSpy.mock.calls[0] ?? [];
			// The query carries the consent journey.
			expect(String(url).split('?')[0]).toBe('/api/inth/v1/consent/records');
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			expect(body.policyId).toBe('react-test');
		} finally {
			fetchSpy.mockRestore();
		}
	});

	test('a state without a policy falls back to the init route', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(() => Promise.resolve(initResponse()));
		const { promise, resolve: resolveState } = deferred();
		try {
			await render(
				<InthProvider
					persistence={false}
					state={promise}
				>
					<Status />
				</InthProvider>
			);
			// Nothing goes out while the server is still resolving.
			await new Promise((resolve) => {
				setTimeout(resolve, 50);
			});
			expect(fetchSpy).not.toHaveBeenCalled();

			resolveState({ initialOverrides: { country: 'DE' }, ...sameOrigin });
			await vi.waitFor(() => {
				expect(fetchSpy).toHaveBeenCalled();
			});
			expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(
				'/api/inth/v1/consent/init'
			);
		} finally {
			fetchSpy.mockRestore();
		}
	});

	test('documents wait for the streamed state, then use its backend and subject', async () => {
		// No save an earlier test queued replays and builds the transport.
		localStorage.clear();
		const hash =
			'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
		const streamed = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b22';
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation((_input, init) =>
				Promise.resolve(
					init?.method === 'POST'
						? Response.json({
								acceptances: [
									{ acceptedAt: 2, hash, type: 'privacy_policy', version: '1' },
								],
								subjectId: streamed,
							})
						: Response.json({
								document: {
									effectiveDate: '2026-11-18T00:00:00.000Z',
									hash,
									id: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
									isCurrent: true,
									requiresAcceptance: true,
									type: 'terms_us',
									version: '1',
								},
							})
				)
			);
		const { promise, resolve: resolveState } = deferred();
		try {
			await render(
				<InthProvider
					persistence={false}
					state={promise}
				>
					<Status />
					<DocumentsCapture />
				</InthProvider>
			);
			await vi.waitFor(() => expect(documents).toBeDefined());
			let settled = false;
			const checking = documents?.check('terms_us');
			const accepting = documents?.accept({ hash, type: 'privacy_policy' });
			void (async () => {
				await Promise.allSettled([checking, accepting]);
				settled = true;
			})();
			await new Promise((resolve) => {
				setTimeout(resolve, 50);
			});
			// Neither answers from the startup subject before the state arrives.
			expect(settled).toBe(false);
			expect(fetchSpy).not.toHaveBeenCalled();

			const fixture = policyFixture({ marketing: true });
			resolveState({
				...fixture,
				...sameOrigin,
				initialRecords: {
					...fixture.initialRecords,
					subject: { subjectId: streamed },
				},
			});

			await expect(checking).resolves.toMatchObject({ accepted: false });
			await accepting;
			const calls = fetchSpy.mock.calls.map(([url, init]) => ({
				subjectId: init?.body
					? (JSON.parse(String(init.body)) as { subjectId?: string }).subjectId
					: undefined,
				url: String(url),
			}));
			expect(calls).toEqual(
				expect.arrayContaining([
					{
						subjectId: undefined,
						url: '/api/inth/v1/documents/terms_us/current',
					},
					{ subjectId: streamed, url: '/api/inth/v1/documents/acceptances' },
				])
			);
			expect(calls).toHaveLength(2);
		} finally {
			fetchSpy.mockRestore();
		}
	});
});
