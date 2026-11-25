/**
 * The client boot's half of the colour scheme.
 *
 * The inline `<head>` script gets the first paint right; `boot()` has to
 * keep it right afterwards — and, because ClientRouter replaces `<html>`'s
 * attributes on every navigation, re-apply it without leaking the previous
 * media-query listener.
 */

import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vite-plus/test';

import { boot } from '../client';
import type { AstroConsentClient } from '../client';
// Vite compiles the island's whole component tree on first import. That
// takes seconds on a busy machine. A static import does it while this file
// loads, so no test timeout covers the compile.
import * as reactPanelSurface from '../components/islands/panel-surface';
import { resolveOptions } from '../integration';
import type { InthAstroOptions, InthColorScheme } from '../inth-options.model';
import { testing as testingMode } from '../testing';
import { reactDialogAdapter } from '../ui/react';
import {
	registerDialogAdapter,
	registerDialogSurface,
} from '../ui/register-dialog-adapter';
import { testRule } from './policy-fixture';
import { ISLAND_RENDER_TIMEOUT } from './react-dialog-island';

interface MediaQueryStub {
	matches: boolean;
	listeners: Set<(event: MediaQueryListEvent) => void>;
	addEventListener: ReturnType<typeof vi.fn>;
	removeEventListener: ReturnType<typeof vi.fn>;
}

let media: MediaQueryStub;
let client: AstroConsentClient | null = null;

const stubMatchMedia = function stubMatchMedia(matches: boolean): void {
	const listeners = new Set<(event: MediaQueryListEvent) => void>();
	media = {
		addEventListener: vi.fn((_type: string, listener: () => void) => {
			listeners.add(listener);
		}),
		listeners,
		matches,
		removeEventListener: vi.fn((_type: string, listener: () => void) => {
			listeners.delete(listener);
		}),
	};
	vi.stubGlobal(
		'matchMedia',
		vi.fn(() => media)
	);
	window.matchMedia = globalThis.matchMedia;
};

const start = function start(
	colorScheme?: InthColorScheme,
	extra: Partial<InthAstroOptions> = {}
): AstroConsentClient {
	const options: InthAstroOptions = {
		mode: testingMode(),
		...extra,
	};
	if (colorScheme) {
		options.colorScheme = colorScheme;
	}
	client = boot(resolveOptions(options));
	return client;
};

beforeEach(() => {
	stubMatchMedia(false);
	document.documentElement.className = '';
	const globals = window as unknown as Record<string, unknown>;
	globals.__inthAstro = undefined;
	globals.__inthAstroColorScheme = undefined;
	globals.__inthAstroConfig = undefined;
	globals.__inthAstroActions = undefined;
});

afterEach(() => {
	client?.dispose();
	client = null;
	document.getElementById('inth-dialog-host')?.remove();
	vi.unstubAllGlobals();
});

const isDark = () => document.documentElement.classList.contains('inth-dark');

describe('boot applies the colour scheme', () => {
	it('pins dark', () => {
		start('dark');
		expect(isDark()).toBe(true);
	});

	it('pins light even when the system is dark', () => {
		stubMatchMedia(true);
		document.documentElement.classList.add('inth-dark');
		start('light');
		expect(isDark()).toBe(false);
	});

	it('follows the system by default', () => {
		stubMatchMedia(true);
		start();
		expect(isDark()).toBe(true);
	});

	it('keeps following the system as the visitor changes it', () => {
		stubMatchMedia(false);
		start();
		expect(isDark()).toBe(false);

		media.matches = true;
		for (const listener of media.listeners) {
			listener({ matches: true } as MediaQueryListEvent);
		}
		expect(isDark()).toBe(true);
	});
});

describe('a webview with no matchMedia', () => {
	it('still honours a pinned scheme instead of throwing', () => {
		vi.stubGlobal('matchMedia', undefined);
		Reflect.set(window, 'matchMedia', undefined);

		expect(() => start('dark')).not.toThrow();
		expect(isDark()).toBe(true);
	});

	it('falls system back to light rather than keeping a stale dark', () => {
		document.documentElement.classList.add('inth-dark');
		vi.stubGlobal('matchMedia', undefined);
		Reflect.set(window, 'matchMedia', undefined);

		expect(() => start('system')).not.toThrow();
		// The documented fallback for `system` is light, and a swapped-in
		// dark shell would otherwise stay dark for the rest of the visit.
		expect(isDark()).toBe(false);
	});
});

describe('ClientRouter navigation', () => {
	it('re-applies against the swapped document without leaking a listener', () => {
		stubMatchMedia(true);
		start();
		expect(isDark()).toBe(true);
		expect(media.listeners.size).toBe(1);

		// The swap replaces `<html>`'s attributes, taking the class with it.
		document.documentElement.className = '';
		document.dispatchEvent(new Event('astro:after-swap'));

		expect(isDark()).toBe(true);
		expect(media.listeners.size).toBe(1);
		expect(media.removeEventListener).toHaveBeenCalled();
	});
});

describe('dispose', () => {
	it('drops the media-query listener', () => {
		stubMatchMedia(true);
		start();
		expect(media.listeners.size).toBe(1);

		client?.dispose();
		client = null;

		expect(media.listeners.size).toBe(0);
		expect(
			(window as unknown as Record<string, unknown>).__inthAstroColorScheme
		).toBeUndefined();
	});
});

describe("colorScheme: 'none'", () => {
	it('leaves a class the site set through boot and navigation', () => {
		stubMatchMedia(false);
		document.documentElement.classList.add('inth-dark');
		start('none');
		expect(isDark()).toBe(true);
		expect(media.listeners.size).toBe(0);

		// The site's own after-swap handler has already re-applied its theme.
		document.dispatchEvent(new Event('astro:after-swap'));
		expect(isDark()).toBe(true);
	});

	it('adds no class when the system is dark', () => {
		stubMatchMedia(true);
		start('none');
		expect(isDark()).toBe(false);

		document.dispatchEvent(new Event('astro:after-swap'));
		expect(isDark()).toBe(false);
		expect(media.listeners.size).toBe(0);
	});
});

describe('colorScheme: null', () => {
	it("leaves the site's class alone like 'none'", () => {
		stubMatchMedia(true);
		document.documentElement.classList.add('dark');
		client = boot(
			resolveOptions({
				colorScheme: null,
				mode: testingMode(),
			})
		);
		expect(isDark()).toBe(false);
		expect(media.listeners.size).toBe(0);
	});
});

describe('opening the React dialog', () => {
	const openReactDialog = async function openReactDialog(
		colorScheme: InthColorScheme
	): Promise<void> {
		registerDialogAdapter('react', () => Promise.resolve(reactDialogAdapter));
		registerDialogSurface('react', () => Promise.resolve(reactPanelSurface));
		const opened = start(colorScheme, {
			mode: testingMode({
				policy: [testRule],
			}),
			ui: 'react',
		});
		await opened.openDialog();
		await vi.waitFor(
			() =>
				expect(
					document.querySelector('[data-testid="consent-dialog-save-button"]')
				).not.toBeNull(),
			ISLAND_RENDER_TIMEOUT
		);
	};

	it('keeps a pinned dark scheme on a page without a .dark class', async () => {
		await openReactDialog('dark');
		expect(isDark()).toBe(true);

		// A class change on `<html>` is what a provider watching for `.dark`
		// would react to.
		document.documentElement.classList.add('site-theme');
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(isDark()).toBe(true);
	});

	it("leaves the site's class alone with colorScheme: 'none'", async () => {
		document.documentElement.classList.add('inth-dark');
		await openReactDialog('none');
		expect(isDark()).toBe(true);

		document.documentElement.classList.remove('inth-dark');
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(isDark()).toBe(false);
	});
});
