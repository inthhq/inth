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
 */
import {
	useActiveUI,
	useConsent,
	useModel,
	useSaveConsents,
} from '@inth/react';
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
});
