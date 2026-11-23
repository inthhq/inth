import type { RevocationReloadOptions } from '@inth/sdk/engine';
import { watchRevocationReload } from '@inth/sdk/engine';
import { onDemandRuntimeModules } from '@inth/sdk/runtime/on-demand';
import {
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
} from '@inth/sdk/runtime/page-globals';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { boot, registerRuntimeModules } from '../client';
import type { AstroConsentClient } from '../client';
import * as reactPanelSurface from '../components/islands/panel-surface';
import * as vuePanelSurface from '../components/islands/panel-surface.vue';
import { resolveOptions } from '../integration';
import { testing as testingMode } from '../testing';
import type { InthAstroOptions } from '../types';
import { registerDialogAdapter, registerDialogSurface } from '../ui/adapter';
import { reactDialogAdapter } from '../ui/react';
import { vueDialogAdapter } from '../ui/vue';
import '@inth/vue/vue-plugin';

import { testResolution, testRule } from './policy-fixture';
import { ISLAND_RENDER_TIMEOUT } from './react-dialog-island';

const reload = vi.fn();

registerRuntimeModules({
	...onDemandRuntimeModules,
	watchRevocationReload: (options: RevocationReloadOptions) =>
		watchRevocationReload({ ...options, reload }),
});

const OPT_OUT_RULE = {
	...testRule,
	id: 'astro_us_ca',
	model: 'opt-out' as const,
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice' as const,
	rights: ['disclosure', 'preferences', 'opt-out'] as const,
};

const cleanup: (() => Promise<void> | void)[] = [];

const resetEarlyTapGlobals = (): void => {
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
	const host = window as unknown as Record<
		string,
		{ stop?: () => void } | undefined
	>;
	host[EARLY_TAPS_WINDOW_KEY]?.stop?.();
	Reflect.deleteProperty(window, EARLY_TAPS_WINDOW_KEY);
};

beforeAll(() => {
	window.matchMedia ??= (query: string) =>
		({
			addEventListener: () => undefined,
			addListener: () => undefined,
			dispatchEvent: () => false,
			matches: false,
			media: query,
			onchange: null,
			removeEventListener: () => undefined,
			removeListener: () => undefined,
		}) as MediaQueryList;
});

afterEach(async () => {
	for (const step of cleanup.splice(0).reverse()) {
		// oxlint-disable-next-line no-await-in-loop -- Tear down in reverse mount order.
		await step();
	}
	resetEarlyTapGlobals();
	(window as unknown as Record<string, unknown>).__inthAstroConfig = undefined;
	reload.mockClear();
	localStorage.clear();
	sessionStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
		}
	}
});

const mountClient = (
	ui: 'react' | 'vue',
	options: Partial<InthAstroOptions> = {},
	rule: typeof OPT_OUT_RULE | typeof testRule = OPT_OUT_RULE,
	initialRecords: Record<string, unknown> = {}
): AstroConsentClient => {
	if (ui === 'react') {
		registerDialogAdapter('react', () => Promise.resolve(reactDialogAdapter));
		registerDialogSurface('react', () => Promise.resolve(reactPanelSurface));
	} else {
		registerDialogAdapter('vue', () => Promise.resolve(vueDialogAdapter));
		registerDialogSurface('vue', () => Promise.resolve(vuePanelSurface));
	}

	(window as unknown as Record<string, unknown>).__inthAstroConfig = {
		initialPolicyResolution: testResolution(rule),
		initialRecords,
		initialTranslations: { language: 'en', translations: {} },
		now: Date.now(),
	};
	const resolved = resolveOptions({
		consentCategories: ['necessary', 'measurement', 'marketing'],
		disableAnimation: true,
		mode: testingMode({ policy: [rule] }),
		reloadOnConsentRevoked: false,
		ui,
		...options,
	});
	const client = boot(resolved);
	cleanup.push(() => {
		client.dispose();
		document.getElementById('inth-dialog-host')?.remove();
	});
	return client;
};

describe.each(['react', 'vue'] as const)(
	'the opt-out link on the %s island',
	(ui) => {
		it('opens the preference dialog instead of opting out under a non-opt-out rule', async () => {
			const client = mountClient(ui, {}, testRule);
			const footerLink = document.createElement('button');
			footerLink.type = 'button';
			footerLink.setAttribute('data-inth-action', 'opt-out');
			footerLink.textContent = 'Do Not Sell or Share My Personal Information';
			document.body.append(footerLink);
			cleanup.push(() => footerLink.remove());

			footerLink.click();

			await vi.waitFor(
				() =>
					expect(
						document.querySelector('[data-testid="consent-dialog-root"]')
					).not.toBeNull(),
				ISLAND_RENDER_TIMEOUT
			);
			expect(client.getConsent().optOut).toBeNull();
			expect(
				document.querySelector('[data-testid="opt-out-confirmation-root"]')
			).toBeNull();
		});
	}
);
