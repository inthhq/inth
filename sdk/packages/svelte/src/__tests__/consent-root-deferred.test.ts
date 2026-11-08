/**
 * `ConsentRoot` hydrates the server's HTML without the consent engine:
 * the server leaves the snapshot it rendered with, the browser renders
 * from it, and a banner tap before the engine loads is recorded in the
 * tap's own task.
 */
import { flushSync, hydrate, unmount } from 'svelte';
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
	vi,
} from 'vitest';

import ConsentRootFixture from './fixtures/consent-root-fixture.svelte';
import { policyFixture } from './policy-fixture';
import { closeSsrWorker, renderRootSsr, warmSsrWorker } from './server-render';

type WindowWithC15t = Window & { c15t?: unknown };

const SCRIPT = {
	category: 'measurement',
	id: 'measure',
	src: 'https://scripts.example.test/measure.js',
};

const BOOT = 'script[data-c15t-boot]';

let mounted: ReturnType<typeof hydrate> | undefined;

/** Server-renders the fixture into the document, then hydrates it. */
const hydrateFromServer = async (
	props: Record<string, unknown>,
	beforeHydrate?: (target: HTMLElement) => void
) => {
	const { body, head } = await renderRootSsr(props);
	document.head.insertAdjacentHTML('beforeend', head);
	const target = document.createElement('div');
	target.innerHTML = body;
	document.body.append(target);
	beforeHydrate?.(target);
	const server = {
		banner: target.querySelector('[data-testid="consent-banner-root"]'),
		boot: JSON.parse(target.querySelector(BOOT)?.textContent ?? 'null'),
		head,
	};
	mounted = hydrate(ConsentRootFixture, {
		props: props as never,
		recover: false,
		target,
	});
	flushSync();
	return server;
};

beforeAll(async () => {
	await warmSsrWorker();
}, 60_000);

afterAll(async () => {
	await closeSsrWorker();
});

afterEach(() => {
	if (mounted) {
		unmount(mounted);
		mounted = undefined;
	}
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
	localStorage.clear();
	delete (window as WindowWithC15t).c15t;
	(
		window as { __c15tEarlyTaps?: { stop?: () => void } }
	).__c15tEarlyTaps?.stop?.();
	delete (window as { __c15tEarlyTaps?: unknown }).__c15tEarlyTaps;
	(window as { __c15tStarted?: unknown }).__c15tStarted = undefined;
	vi.restoreAllMocks();
});

describe('ConsentRoot deferred engine', () => {
	test('hydrates the server HTML from the boot data, without the engine', async () => {
		const warn = vi.spyOn(console, 'warn');
		const server = await hydrateFromServer({
			prefetch: policyFixture(),
			scripts: [SCRIPT],
		});

		// The engine may wait, so the head preloads neither it nor the loader.
		expect(server.boot).toMatchObject({ d: 1, s: { activeUI: 'banner' } });
		expect(server.head).not.toContain('c15t-modulepreload');
		// Hydration adopted the server's banner.
		expect(document.querySelector('[data-testid="consent-banner-root"]')).toBe(
			server.banner
		);
		expect(
			warn.mock.calls.filter(([message]) => /hydrat/iu.test(String(message)))
		).toEqual([]);
		expect((window as WindowWithC15t).c15t).toBeUndefined();
	});

	test('an accept before the engine records the choice and starts the scripts in the tap', async () => {
		await hydrateFromServer({
			prefetch: policyFixture(),
			scripts: [SCRIPT],
		});
		const accept = document.querySelector<HTMLButtonElement>(
			'[data-testid="consent-banner-accept-button"]'
		);
		expect((window as WindowWithC15t).c15t).toBeUndefined();

		accept?.click();

		// In the tap's own task: the allowed script is in the page.
		expect(
			document.querySelector(`script[src="${SCRIPT.src}"]`)
		).not.toBeNull();
		flushSync();
		await vi.waitFor(() => {
			expect(
				document.querySelector('[data-testid="consent-banner-root"]')
			).toBeNull();
		});
		// One task later the commit chunk stores the record; then the engine
		// loads and starts from it.
		await vi.waitFor(() => {
			expect(document.cookie).toMatch(/(?:^|; )c15t=/u);
		});
		await vi.waitFor(
			() => {
				expect((window as WindowWithC15t).c15t).toBeDefined();
			},
			{ timeout: 5000 }
		);
		expect(
			document.querySelectorAll(`script[src="${SCRIPT.src}"]`)
		).toHaveLength(1);
	});

	test('an accept tapped before hydration is replayed once the banner mounts', async () => {
		await hydrateFromServer(
			{ prefetch: policyFixture(), scripts: [SCRIPT] },
			(target) => {
				// The browser runs the server's inline script as it parses the
				// banner; markup set through innerHTML does not, so run it here.
				const inline = target.querySelector('script[data-c15t-early-tap]');
				expect(inline).not.toBeNull();
				// oxlint-disable-next-line no-eval -- The page's own inline script.
				(0, eval)(inline?.textContent ?? '');
				expect(
					(window as { __c15tEarlyTaps?: { taps?: unknown[] } }).__c15tEarlyTaps
						?.taps
				).toEqual([]);

				const banner = target.querySelector<HTMLElement>(
					'[data-testid="consent-banner-root"]'
				);
				target
					.querySelector<HTMLButtonElement>(
						'[data-testid="consent-banner-accept-button"]'
					)
					?.click();
				// The script hides the banner at the tap and keeps the tap.
				expect(banner && getComputedStyle(banner).display).toBe('none');
				expect(
					document.querySelector(`script[src="${SCRIPT.src}"]`)
				).toBeNull();
			}
		);

		await vi.waitFor(() => {
			expect(
				document.querySelector(`script[src="${SCRIPT.src}"]`)
			).not.toBeNull();
		});
		await vi.waitFor(() => {
			expect(document.cookie).toMatch(/(?:^|; )c15t=/u);
		});
		// Claimed: the script stopped and holds nothing more.
		expect((window as { __c15tEarlyTaps?: unknown }).__c15tEarlyTaps).toEqual(
			{}
		);
	});

	test('a returning visitor gets the engine at once, preloaded by the server render', async () => {
		const server = await hydrateFromServer({
			prefetch: policyFixture({ marketing: true, measurement: true }),
			scripts: [SCRIPT],
		});

		expect(server.boot.d).toBeUndefined();
		expect(server.head).toMatch(
			/<meta name="c15t-modulepreload" content="engine loader-and-blocker"/u
		);
		await vi.waitFor(
			() => {
				expect((window as WindowWithC15t).c15t).toBeDefined();
			},
			{ timeout: 5000 }
		);
	});
});
