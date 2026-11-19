/**
 * In the browser the deferred island keeps the server's HTML, loads its
 * module only when a trigger fires, and replays clicks that landed before
 * it hydrated.
 */
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';

import {
	DEFER_ATTRIBUTE,
	DEFER_CAPTURE_SCRIPT,
	DEFER_WINDOW_KEY,
	deferConsent,
} from '../defer';

/** The state the capture script and the loader share on `window`. */
interface DeferState {
	/** Set while the loader waits for a trigger. */
	f?: () => void;
	/** The island hydrated. */
	h: boolean;
}

const deferState = (): DeferState | undefined =>
	(window as unknown as Record<string, DeferState | undefined>)[
		DEFER_WINDOW_KEY
	];

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
	// The capture script's window listeners outlive the test and keep this
	// state. Mark it hydrated so they stop intercepting the next test's
	// clicks, then drop it so the next mount starts fresh.
	const state = deferState();
	if (state) {
		state.h = true;
	}
	Reflect.deleteProperty(window, DEFER_WINDOW_KEY);
});

/** A hero image that has not loaded yet and never loads by itself. */
const heroImage = (): HTMLImageElement => {
	const image = document.createElement('img');
	image.setAttribute('fetchpriority', 'high');
	Object.defineProperty(image, 'complete', { value: false });
	document.body.append(image);
	cleanups.push(() => image.remove());
	return image;
};

/**
 * Server HTML for the island: the same tree `deferConsent` renders on the
 * server, with the loaded module in place of the lazy one.
 */
const serverHTML = (inner: ReactNode): string =>
	renderToString(
		<div
			{...{ [DEFER_ATTRIBUTE]: '' }}
			style={{ display: 'contents' }}
		>
			{/* oxlint-disable-next-line react/no-danger -- Mirrors the island. */}
			<script dangerouslySetInnerHTML={{ __html: '' }} />
			<Suspense fallback={null}>{inner}</Suspense>
		</div>
	);

const mount = (html: string, island: ReactNode) => {
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.append(container);
	// Inline scripts set through innerHTML do not run; run it as the
	// parser would.
	// oxlint-disable-next-line no-new-func -- Runs the inline script's source.
	new Function(DEFER_CAPTURE_SCRIPT)();
	const errors: unknown[] = [];
	let root: Root | undefined;
	root = hydrateRoot(container, island, {
		onRecoverableError: (error) => errors.push(error),
	});
	cleanups.push(() => {
		root?.unmount();
		root = undefined;
		container.remove();
	});
	return { container, errors };
};

/**
 * Resolves once the island waits for a trigger. React hydrates the
 * island's Suspense boundary at idle priority, so a fixed delay races it
 * on a busy runner; a trigger fired before this is lost.
 */
const islandListening = (): Promise<void> =>
	vi.waitFor(() => expect(deferState()?.f).toBeTypeOf('function'));

/** Resolves once the loaded module hydrated in place. */
const islandHydrated = (): Promise<void> =>
	vi.waitFor(() => expect(deferState()?.h).toBe(true));

test('loads after the hero image and keeps the server HTML until then', async () => {
	const image = heroImage();
	const Inner = ({ label }: { label: string }) => (
		<button
			data-testid="inside"
			type="button"
		>
			{label}
		</button>
	);
	const load = vi.fn(() => Promise.resolve({ default: Inner }));
	const Island = deferConsent(load);
	const { container, errors } = mount(
		serverHTML(<Inner label="Prefs" />),
		<Island label="Prefs" />
	);

	await islandListening();
	expect(load).not.toHaveBeenCalled();
	expect(container.querySelector('[data-testid="inside"]')?.textContent).toBe(
		'Prefs'
	);

	image.dispatchEvent(new Event('load'));
	await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
	await islandHydrated();
	expect(errors).toEqual([]);
	expect(container.querySelectorAll('[data-testid="inside"]')).toHaveLength(1);
});

test('waits for every hero image, not only the first', async () => {
	const first = heroImage();
	const second = heroImage();
	const Inner = () => null;
	const load = vi.fn(() => Promise.resolve({ default: Inner }));
	const Island = deferConsent(load);
	mount(serverHTML(<Inner />), <Island />);

	await islandListening();
	first.dispatchEvent(new Event('load'));
	await new Promise((resolve) => {
		setTimeout(resolve, 20);
	});
	expect(load).not.toHaveBeenCalled();
	second.dispatchEvent(new Event('error'));
	await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
});

test('a click before hydration starts the load and replays once hydrated', async () => {
	heroImage();
	const onClick = vi.fn();
	const Inner = () => (
		<button
			data-testid="inside"
			onClick={onClick}
			type="button"
		>
			Prefs
		</button>
	);
	const load = vi.fn(() => Promise.resolve({ default: Inner }));
	const Island = deferConsent(load);
	const { container, errors } = mount(serverHTML(<Inner />), <Island />);
	const button = container.querySelector<HTMLButtonElement>(
		'[data-testid="inside"]'
	);

	// Before React has hydrated anything: only the capture script sees it.
	button?.click();
	expect(onClick).not.toHaveBeenCalled();
	expect(button?.getAttribute('aria-busy')).toBe('true');

	await vi.waitFor(() => expect(onClick).toHaveBeenCalledTimes(1));
	expect(load).toHaveBeenCalledTimes(1);
	expect(button?.hasAttribute('aria-busy')).toBe(false);
	expect(errors).toEqual([]);
});

test("leaves stock banner actions to Inth's early-tap script", async () => {
	heroImage();
	const Inner = () => (
		<div data-testid="consent-banner-root">
			<button
				data-action="accept"
				type="button"
			>
				Accept
			</button>
		</div>
	);
	const load = vi.fn(() => Promise.resolve({ default: Inner }));
	const Island = deferConsent(load);
	const { container } = mount(serverHTML(<Inner />), <Island />);
	await islandListening();
	const seen = vi.fn();
	document.addEventListener('click', seen, true);
	cleanups.push(() => document.removeEventListener('click', seen, true));

	container.querySelector<HTMLButtonElement>('[data-action="accept"]')?.click();

	expect(seen).toHaveBeenCalledTimes(1);
	await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
});
