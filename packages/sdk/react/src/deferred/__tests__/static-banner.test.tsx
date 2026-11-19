/**
 * The static banner `consentManifest()` puts in `index.html`
 * (`@inth/react/static-banner`) and the client-rendered `ConsentProvider`
 * that replaces it: one banner at any time, no second entry, the page's
 * stylesheets adopted, and a tap on the static banner recorded once.
 */
import { EARLY_CONSENT_TAP_SCRIPT } from '@inth/sdk/surface-actions';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { PREFETCH_WINDOW_KEY } from '../../../../core/src/libs/page-globals';
import { STATIC_BANNER_ATTR as CORE_STATIC_BANNER_ATTR } from '../../../../core/src/libs/static-banner';
import init from '../../../../core/src/runtime/__tests__/fixtures/hosted-init-gb.json' with { type: 'json' };
import { ConsentBanner } from '../../components/prompt';
import { STATIC_BANNER_ATTR } from '../../components/prompt/static-banner-shell';
import { useSnapshot } from '../../hooks';
import { renderStaticBanner, STATIC_BANNER_SHEETS } from '../../static-banner';
import { ConsentProvider } from '../client-provider';

/** What `POST /v1/consent/records` answers a save. */
const recordAnswer = (request?: RequestInit) => ({
	recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
	subjectId: (JSON.parse(String(request?.body)) as { subjectId: string })
		.subjectId,
});

const BACKEND = 'https://consent.test';
const ROOT = '[data-testid="consent-banner-root"]';

const Probe = () => {
	const snapshot = useSnapshot();
	return (
		<main
			data-active-ui={snapshot.activeUI}
			data-marketing={String(snapshot.effectivePermissions.marketing)}
			data-testid="probe"
		/>
	);
};

const fetchMock = vi.fn((_url: string, request?: RequestInit) =>
	Promise.resolve(Response.json(request?.body ? recordAnswer(request) : {}))
);
const subjectSaves = () =>
	fetchMock.mock.calls.filter(([url]) =>
		String(url).includes('/v1/consent/records')
	);

let answer: () => void = () => undefined;
const requestContext = {
	country: null,
	credentials: 'same-origin',
	gpc: false,
	language: null,
	projectUrl: BACKEND,
	region: null,
};

/** What `index.html` holds: the inline `/v1/consent/init` request, still in flight. */
const prefetch = function prefetch() {
	const promise = new Promise((resolve) => {
		answer = () =>
			resolve({
				init,
				metadata: { experiment: null, journey: null, requestContext },
			});
	});
	(window as unknown as Record<string, unknown>)[PREFETCH_WINDOW_KEY] = {
		key: { promise, requestContext },
	};
};

const added: Element[] = [];

/**
 * The static banner as the page shows it once its script revealed it: the
 * build's markup at the start of `<body>`, its sheets in `<head>`, and the
 * early-tap script, which runs as the parser would run it.
 */
const mountStaticBanner = function mountStaticBanner(): HTMLElement {
	for (const { css, id } of STATIC_BANNER_SHEETS) {
		const style = document.createElement('style');
		style.dataset.href = id;
		style.dataset.precedence = 'inth';
		style.textContent = css;
		document.head.append(style);
		added.push(style);
	}
	const tapScript = document.createElement('script');
	tapScript.textContent = EARLY_CONSENT_TAP_SCRIPT;
	document.body.prepend(tapScript);
	const banner = document.createElement('div');
	banner.setAttribute(STATIC_BANNER_ATTR, '');
	// `innerHTML` leaves the markup's own copy of the script inert.
	banner.innerHTML = renderStaticBanner(init as never) ?? '';
	tapScript.after(banner);
	added.push(tapScript, banner);
	return banner;
};

const renderPage = () =>
	render(
		<ConsentProvider
			options={{
				consentCategories: ['necessary', 'measurement', 'marketing'],
				journey: false,
				projectUrl: BACKEND,
			}}
		>
			<Probe />
			<ConsentBanner />
		</ConsentProvider>
	);

beforeEach(() => {
	fetchMock.mockClear();
	vi.stubGlobal('fetch', fetchMock);
	prefetch();
});

afterEach(() => {
	vi.unstubAllGlobals();
	for (const element of added.splice(0)) {
		element.remove();
	}
	for (const id of ['inth-early-tap', 'inth-early-commit']) {
		document.getElementById(id)?.remove();
	}
	for (const key of [PREFETCH_WINDOW_KEY, '__inthEarlyTaps']) {
		Reflect.deleteProperty(window, key);
	}
	document.cookie = 'inth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
	localStorage.clear();
});

test('the build renders the stock banner for an /init answer, and nothing without a choice prompt', () => {
	const html = renderStaticBanner(init as never) ?? '';
	expect(html).toContain('data-testid="consent-banner-accept-button"');
	expect(html).toContain(init.translations.translations.cookieBanner.title);
	// The early-tap script comes first, so a tap on the buttons is kept.
	expect(html.indexOf('<script>')).toBeLessThan(
		html.indexOf(ROOT.slice(1, -1))
	);
	expect(
		renderStaticBanner({
			...init,
			policyResolution: {
				...init.policyResolution,
				policy: { ...init.policyResolution.policy, prompt: 'none' },
			},
		} as never)
	).toBeUndefined();
	expect(STATIC_BANNER_ATTR).toBe(CORE_STATIC_BANNER_ATTR);
});

test('the client banner takes the static banner’s place: one banner, same markup, no entry, sheets adopted', async () => {
	const banner = mountStaticBanner();
	const staticRoot = banner.querySelector(ROOT)?.outerHTML;
	expect(staticRoot).toBeTruthy();
	const frames: number[] = [];
	let watching = true;
	const watch = () => {
		frames.push(document.querySelectorAll(ROOT).length);
		if (watching) {
			requestAnimationFrame(watch);
		}
	};
	requestAnimationFrame(watch);

	const screen = await renderPage();
	// Long enough after the first paint that a banner arriving now would
	// otherwise fade in (`data-entry="late"`).
	await new Promise((resolve) => {
		setTimeout(resolve, 300);
	});
	expect(
		performance
			.getEntriesByType('paint')
			.some((entry) => entry.name === 'first-contentful-paint')
	).toBe(true);
	answer();
	await expect
		.element(screen.getByTestId('probe'))
		.toHaveAttribute('data-active-ui', 'banner');
	await vi.waitFor(() =>
		expect(document.querySelector(`[${STATIC_BANNER_ATTR}]`)).toBeNull()
	);
	watching = false;
	const roots = document.querySelectorAll(ROOT);
	expect(roots).toHaveLength(1);
	const [client] = roots;
	// The markup the build rendered is the markup the client rendered,
	// apart from the branding link's `ref`, which names the page's host.
	expect(client?.outerHTML.replace(/\?ref=[^"]*/u, '')).toBe(staticRoot);
	expect(client?.getAttribute('data-entry')).toBeNull();
	expect(frames.every((count) => count === 1)).toBe(true);
	// The page's sheets were adopted, not rendered a second time.
	for (const { id } of STATIC_BANNER_SHEETS) {
		expect(document.querySelectorAll(`style[data-href~="${id}"]`)).toHaveLength(
			1
		);
	}
});

test('an Accept tapped on the static banner before the client banner is recorded once', async () => {
	const banner = mountStaticBanner();
	(banner.querySelector('[data-action="accept"]') as HTMLButtonElement).click();
	// The early-tap script hid it at the tap.
	expect(getComputedStyle(banner.querySelector(ROOT) as Element).display).toBe(
		'none'
	);

	const screen = await renderPage();
	answer();
	await expect
		.element(screen.getByTestId('probe'))
		.toHaveAttribute('data-marketing', 'true');
	await vi.waitFor(() => expect(localStorage.getItem('inth')).not.toBeNull(), {
		timeout: 5000,
	});
	await vi.waitFor(() => expect(subjectSaves()).toHaveLength(1), {
		timeout: 5000,
	});
	await new Promise((resolve) => {
		setTimeout(resolve, 500);
	});
	expect(subjectSaves()).toHaveLength(1);
	expect(document.querySelector(`[${STATIC_BANNER_ATTR}]`)).toBeNull();
	await expect
		.element(screen.getByTestId('probe'))
		.toHaveAttribute('data-active-ui', 'none');
	const visible = [...document.querySelectorAll(ROOT)].filter(
		(root) => getComputedStyle(root).display !== 'none'
	);
	expect(visible).toEqual([]);
});

test('a static banner accepted before the client banner stays hidden after the root stops waiting for it', async () => {
	const banner = mountStaticBanner();
	(banner.querySelector('[data-action="accept"]') as HTMLButtonElement).click();
	const screen = await renderPage();
	answer();
	await expect
		.element(screen.getByTestId('probe'))
		.toHaveAttribute('data-marketing', 'true');
	await vi.waitFor(() => expect(subjectSaves()).toHaveLength(1), {
		timeout: 5000,
	});
	// Past the 10 s the root keeps the tapped banner hidden for.
	const start = Date.now();
	const clock = vi.spyOn(Date, 'now').mockImplementation(() => start + 11_000);
	try {
		await new Promise((resolve) => {
			setTimeout(resolve, 200);
		});
		const visible = [...document.querySelectorAll(ROOT)].filter(
			(root) => getComputedStyle(root).display !== 'none'
		);
		expect(visible).toEqual([]);
	} finally {
		clock.mockRestore();
	}
});

/**
 * A priority image that stays loading: lazy and below the fold, so the
 * browser never fetches it, as a hero still downloading on a slow link.
 */
const mountLoadingHero = function mountLoadingHero(): void {
	const spacer = document.createElement('div');
	spacer.style.height = '10000px';
	const hero = document.createElement('img');
	hero.setAttribute('fetchpriority', 'high');
	hero.loading = 'lazy';
	hero.src = '/never-fetched-hero.png';
	document.body.append(spacer, hero);
	added.push(spacer, hero);
	expect(hero.complete).toBe(false);
};

test('with a static banner, the root reads /init only once the priority images loaded or the visitor acts', async () => {
	mountStaticBanner();
	mountLoadingHero();
	const screen = await renderPage();
	answer();
	await new Promise((resolve) => {
		setTimeout(resolve, 300);
	});
	// The answer is in, but the root has not read it: the static banner
	// stands in, and the hero has the connection.
	await expect
		.element(screen.getByTestId('probe'))
		.toHaveAttribute('data-active-ui', 'none');
	expect(document.querySelector(`[${STATIC_BANNER_ATTR}]`)).not.toBeNull();

	document.body.dispatchEvent(
		new PointerEvent('pointerdown', { bubbles: true })
	);
	await expect
		.element(screen.getByTestId('probe'))
		.toHaveAttribute('data-active-ui', 'banner');
	await vi.waitFor(() =>
		expect(document.querySelector(`[${STATIC_BANNER_ATTR}]`)).toBeNull()
	);
	expect(document.querySelectorAll(ROOT)).toHaveLength(1);
});

test('an Accept tapped on the static banner while the root waits is recorded once', async () => {
	const banner = mountStaticBanner();
	mountLoadingHero();
	const screen = await renderPage();
	answer();
	await new Promise((resolve) => {
		setTimeout(resolve, 100);
	});
	// A click with no pointer down, as a keyboard or assistive technology
	// sends it: the early-tap script records it and wakes the root.
	(banner.querySelector('[data-action="accept"]') as HTMLButtonElement).click();
	await expect
		.element(screen.getByTestId('probe'))
		.toHaveAttribute('data-marketing', 'true');
	await vi.waitFor(() => expect(subjectSaves()).toHaveLength(1), {
		timeout: 5000,
	});
	await new Promise((resolve) => {
		setTimeout(resolve, 500);
	});
	expect(subjectSaves()).toHaveLength(1);
	const visible = [...document.querySelectorAll(ROOT)].filter(
		(root) => getComputedStyle(root).display !== 'none'
	);
	expect(visible).toEqual([]);
});
