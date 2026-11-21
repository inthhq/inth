/**
 * Mount a prerendered `.astro` fragment the way a real Astro page would.
 *
 * An Astro page is server-rendered HTML plus one boot script. This does the
 * same two things: it inlines the config the server produced, drops the
 * markup into the document, and boots `@inth/astro/client` with the same
 * resolved options and the same Svelte dialog adapter the integration
 * registers. Nothing here is Storybook-specific behaviour — the point is
 * that the story exercises the shipped runtime, not a stand-in.
 */

import type { InthClientOptionsExtension } from '@inth/astro';
import {
	boot,
	getConsentClient,
	registerDialogAdapter,
	registerDialogSurface,
	registerIAB,
	registerTransport,
} from '@inth/astro/client';
import { createLazyIABFactory } from '@inth/sdk/runtime';
import { mountRuntimeIAB } from '@inth/sdk/runtime/on-demand';
import prerendered from 'virtual:inth-astro-prerendered';

import {
	storybookIABPolicy,
	storybookMode,
	storybookOptOutPolicy,
	storybookOptOutRecords,
	storybookOptOutPolicyResolution,
	storybookPolicy,
} from '../../storybook-consent-policy';
import { requireStoryVariant } from './story-variants';
import type { AstroUIAdapter } from './story-variants';

const DIALOG_HOST_ID = 'inth-dialog-host';

const registered = new Set<string>();
let activeStoryPolicy: 'default' | 'opt-out' = 'default';

// Every story resolves its policy in the browser when it inits again, such as
// when its dialog opens: the IAB rule when the story turns IAB on, else the
// default. A Storybook build is a production build, where testing() refuses
// to run.
const storyModes = {
	default: storybookMode([storybookPolicy]),
	iab: storybookMode([storybookIABPolicy]),
	optOut: storybookMode([storybookOptOutPolicy]),
};
registerTransport(() =>
	Object.assign(
		(context: Parameters<typeof storyModes.default>[0]) => {
			if (context.iabEnabled) {
				return storyModes.iab(context);
			}
			if (activeStoryPolicy === 'opt-out') {
				return storyModes.optOut(context);
			}
			return storyModes.default(context);
		},
		{ kind: 'offline' as const }
	)
);

/**
 * Register one dialog adapter and the island it mounts.
 *
 * The integration registers exactly the one a site's `ui` option names,
 * which is what keeps a Svelte-only build from resolving React and Vue.
 * The Storybook does the same, one story at a time, so each story
 * exercises the adapter it claims to.
 */
const registerAdapters = function registerAdapters(ui: AstroUIAdapter): void {
	if (registered.has(ui)) {
		return;
	}
	registered.add(ui);

	if (ui === 'react') {
		registerDialogAdapter(
			'react',
			async () => (await import('@inth/astro/ui/react')).reactDialogAdapter
		);
		registerDialogSurface(
			'react',
			() => import('@inth/astro/islands/panel-surface.tsx')
		);
		return;
	}

	if (ui === 'vue') {
		registerDialogAdapter(
			'vue',
			async () => (await import('@inth/astro/ui/vue')).vueDialogAdapter
		);
		registerDialogSurface(
			'vue',
			() => import('@inth/astro/islands/panel-surface.vue')
		);
		return;
	}

	registerDialogAdapter(
		'svelte',
		async () => (await import('@inth/astro/ui/svelte')).svelteDialogAdapter
	);
	registerDialogSurface(
		'svelte',
		() => import('@inth/astro/islands/panel-surface.svelte')
	);
};

const clearCookies = function clearCookies(): void {
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
		}
	}
};

/**
 * Tear the previous story's page down.
 *
 * The runtime is a page-level singleton on `window`, so without this the
 * second story in a session would silently reuse the first one's kernel,
 * its consent state and its mounted dialog.
 */
const resetPage = function resetPage(): void {
	getConsentClient()?.dispose();
	document.getElementById(DIALOG_HOST_ID)?.remove();
	for (const host of document.querySelectorAll('[data-inth-story-host]')) {
		host.remove();
	}
	document.documentElement.classList.remove('inth-dark');
	window.localStorage.clear();
	clearCookies();
};

/**
 * Render one catalogued Astro variant into the Storybook canvas.
 *
 * @param variantId - The id from the story catalogue.
 * @param extension - What a site's `clientEntrypoint` would default-export,
 * such as callbacks.
 * @returns The element Storybook should mount.
 */
export const renderAstroStory = function renderAstroStory(
	variantId: string,
	extension?: InthClientOptionsExtension
): HTMLElement {
	const variant = requireStoryVariant(variantId);
	const entry = prerendered[variantId];
	if (!entry) {
		throw new Error(`Astro variant "${variantId}" was not prerendered.`);
	}

	resetPage();
	activeStoryPolicy = variant.options?.policy ?? 'default';
	registerAdapters(variant.ui ?? 'svelte');
	if (variant.options?.iab) {
		registerIAB({
			...createLazyIABFactory(
				() => import('../../../packages/sdk/iab/src/index')
			),
			mount: mountRuntimeIAB,
		});
	}

	const host = document.createElement('div');
	host.setAttribute('data-inth-story-host', variantId);
	host.innerHTML = entry.html;

	// The banner reads its kernel config off `window` exactly as it does on
	// a server-rendered page, so it must be there before `boot()` runs.
	const baseConfig =
		entry.config && typeof entry.config === 'object'
			? (entry.config as Record<string, unknown>)
			: {};
	const config: Record<string, unknown> = { ...baseConfig };
	if (variant.openOptOutConfirmation) {
		config.initialPolicyResolution ??= storybookOptOutPolicyResolution;
	}
	if (variant.openOptOutConfirmation === 'signal') {
		config.initialGpc = true;
		config.initialRecords = storybookOptOutRecords('gpc');
	}
	(window as unknown as Record<string, unknown>).__inthAstroConfig = config;

	if (variant.dark) {
		document.documentElement.classList.add('inth-dark');
	}

	// Storybook mounts the returned element after the story function
	// returns, but `boot()` has to see the markup to wire the banner. Queue
	// the boot for the next task instead of guessing.
	queueMicrotask(() => {
		const client = boot(entry.options as Parameters<typeof boot>[0], extension);
		if (variant.openDialog) {
			void client.openDialog(variant.openDialog);
		}
		if (variant.openOptOutConfirmation) {
			void client.optOut();
		}
	});

	return host;
};
