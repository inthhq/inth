/**
 * The Privacy Choices (v6) banner rendered by the server and hydrated
 * under the Nuxt plugin's deferred context (`runtime/deferred/shell.ts`):
 * its presentation, and an all-in-one Drawer's options, arrive in chunks
 * of their own after the banner hydrated, and must still hydrate against
 * the snapshot the server rendered; and a tap on the server's HTML before
 * hydration is replayed through the banner's own handlers.
 */
import type { ConsentContainer, ConsentSnapshot } from '@inth/sdk/engine';
import type { InitOutput } from '@inth/sdk/schema/types';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { translations } from '@inth/sdk/translations/en';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createSSRApp, defineComponent, h } from 'vue';
import type { App } from 'vue';
import { renderToString } from 'vue/server-renderer';

import { ConsentBannerHost } from '../runtime/components/lazy-surfaces';
import {
	privacyChoicesPresentations,
	privacyChoicesPresentationsKey,
} from '../runtime/components/prompt/privacy-choices/presentations';
import type { PrivacyChoicesPresentationLoader } from '../runtime/components/prompt/privacy-choices/presentations';
import { createDeferredContext } from '../runtime/deferred/shell';
import type {
	RuntimeConsentConfig,
	VueConsentKernelContext,
} from '../runtime/kernel';
import {
	consentConfigKey,
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from '../runtime/utils/symbols';
import { createVueConsentKernelContext } from './test-kernel';

const init: InitOutput = {
	branding: 'inth',
	location: { countryCode: 'DE', regionCode: null },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			countryCode: null,
			regionCode: null,
			rules: [
				{
					categories: ['measurement', 'marketing'],
					id: 'nuxt_privacy_choices',
					match: { fallback: true },
					model: 'opt-in',
					prompt: 'choice',
					scopeMode: 'permissive',
				},
			],
		})
	),
	translations: { language: 'en', translations },
};

const configFor = (container: ConsentContainer): RuntimeConsentConfig =>
	({
		consentCategories: ['necessary', 'measurement', 'marketing'],
		customFetch: vi.fn(() =>
			Promise.resolve(Response.json({ ok: true }))
		) as unknown as typeof fetch,
		disableAnimation: true,
		hideBranding: true,
		presentation: { design: 'privacy-choices', prompt: { container } },
		projectUrl: 'https://consent.example',
	}) as RuntimeConsentConfig;

const provides = (
	app: App,
	context: VueConsentKernelContext,
	config: RuntimeConsentConfig
): void => {
	app.provide(consentConfigKey, config);
	app.provide(symbolKernelContext, context);
	app.provide(symbolKernel, context.kernel);
	app.provide(symbolSnapshot, context.snapshot);
	app.provide(symbolInit, context.init);
	app.provide(symbolActiveUI, context.activeUI);
	app.provide(symbolConsent, context.storedConsent);
};

const Root = defineComponent({ render: () => h(ConsentBannerHost) });

const contexts: VueConsentKernelContext[] = [];
const apps: App[] = [];

/** The banner's HTML, as the server renders it for a fresh visitor. */
const renderOnServer = async (
	config: RuntimeConsentConfig
): Promise<{ html: string; snapshot: ConsentSnapshot }> => {
	const server = createVueConsentKernelContext({ config, prefetch: init });
	server.activeUI.value = 'banner';
	const app = createSSRApp(Root);
	provides(app, server, config);
	vi.stubGlobal('window', undefined);
	vi.stubGlobal('document', undefined);
	let html: string;
	try {
		html = await renderToString(app);
	} finally {
		vi.unstubAllGlobals();
	}
	const snapshot = server.kernel.getSnapshot();
	server.dispose();
	return { html, snapshot };
};

interface Hydrated {
	context: VueConsentKernelContext;
	/** Vue's hydration warnings and errors. */
	problems: string[];
	/** Lets the engine attach, with the snapshot `engine` sets up. */
	releaseEngine: () => void;
	engine: () => VueConsentKernelContext | undefined;
}

/**
 * Hydrate the server's HTML in the browser under the deferred context,
 * whose engine waits for `releaseEngine`. `beforeBundles` runs on the
 * server's HTML first, as the page's inline scripts and early taps do.
 */
const hydrate = (
	html: string,
	snapshot: ConsentSnapshot,
	config: RuntimeConsentConfig,
	beforeBundles?: () => void
): Hydrated => {
	let release: () => void = () => undefined;
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	let engine: VueConsentKernelContext | undefined;
	const context = createDeferredContext({
		config: () => config,
		loadEngine: async () => {
			await released;
			return () => {
				engine = createVueConsentKernelContext({ config, prefetch: init });
				contexts.push(engine);
				return engine;
			};
		},
		schedule: (requestEngine) => {
			requestEngine();
			return () => undefined;
		},
		snapshot,
	});
	contexts.push(context);
	const problems: string[] = [];
	vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
		problems.push(args.map(String).join(' '));
	});
	const app = createSSRApp(Root);
	app.config.warnHandler = (message) => problems.push(message);
	provides(app, context, config);
	// The server's process already loaded the presentation; the browser's
	// chunk arrives after the banner's, as it does on a real page.
	const late =
		(
			load: PrivacyChoicesPresentationLoader
		): PrivacyChoicesPresentationLoader =>
		async () => {
			await new Promise((resolve) => {
				setTimeout(resolve, 50);
			});
			return load();
		};
	app.provide(privacyChoicesPresentationsKey, {
		bar: late(privacyChoicesPresentations.bar),
		card: late(privacyChoicesPresentations.card),
		drawer: late(privacyChoicesPresentations.drawer),
	});
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.append(container);
	beforeBundles?.();
	app.mount(container);
	apps.push(app);
	context.start();
	return { context, engine: () => engine, problems, releaseEngine: release };
};

const $ = (testId: string) =>
	document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

afterEach(() => {
	for (const app of apps.splice(0)) {
		app.unmount();
	}
	for (const context of contexts.splice(0)) {
		context.dispose();
	}
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	localStorage.clear();
	Reflect.deleteProperty(window, '__inthEarlyTaps');
	Reflect.deleteProperty(window, '__inthStarted');
	document.head.innerHTML = '';
	document.body.innerHTML = '';
});

describe('Nuxt hydration of the Privacy Choices banner', () => {
	test.each([
		['a Card', { type: 'card' } as ConsentContainer, 'card-start', false],
		[
			'an all-in-one Drawer',
			{ side: 'end', type: 'drawer' } as ConsentContainer,
			'drawer-end',
			true,
		],
	])(
		'%s hydrates against the server snapshot, then follows the live one',
		async (_name, container, placement, allInOne) => {
			const config = configFor(container);
			const { html, snapshot } = await renderOnServer(config);
			expect(html).toContain('data-design="privacy-choices"');
			expect(html).toContain(`data-placement="${placement}"`);
			// The server renders an all-in-one Drawer's options too.
			expect(html.includes('consent-banner-save-button')).toBe(allInOne);
			const { context, problems, releaseEngine } = hydrate(
				html,
				snapshot,
				config
			);
			// The live snapshot moves on before the banner hydrates: the
			// prompt is no longer owed, though the server rendered it.
			context.kernel.set.activeUI('none');
			releaseEngine();
			// The prompt leaves once the banner reads the live snapshot:
			// after its presentation hydrated, never before.
			await vi.waitFor(
				() => {
					expect($('consent-banner-root')).toBeNull();
				},
				{ timeout: 4000 }
			);
			expect(problems.filter((line) => /hydrat/iu.test(line))).toEqual([]);
		}
	);
});

describe('[BNR-06] a tap before hydration', () => {
	test('is replayed through the Privacy Choices handlers once the banner hydrates', async () => {
		const config = configFor({ type: 'card' });
		const { html, snapshot } = await renderOnServer(config);
		const { engine, problems, releaseEngine } = hydrate(
			html,
			snapshot,
			config,
			() => {
				// The server wrote the early-tap script ahead of the banner;
				// it runs before any bundle, and the visitor taps Accept.
				const script = document.querySelector('script');
				expect(script?.textContent).toContain('__inthEarlyTaps');
				// oxlint-disable-next-line no-new-func -- Runs the inline script's text as the page would.
				new Function(script?.textContent ?? '')();
				const accept = $('consent-banner-accept-button');
				expect(accept?.hasAttribute('data-early-tap')).toBe(false);
				accept?.click();
				// The script holds the tap and hides the banner at once.
				expect(document.getElementById('inth-early-tap')).not.toBeNull();
			}
		);
		releaseEngine();
		await vi.waitFor(
			() => {
				expect(engine()?.kernel.getSnapshot().explicitChoice).not.toBeNull();
			},
			{ timeout: 4000 }
		);
		expect(engine()?.kernel.getSnapshot().activeUI).not.toBe('banner');
		// The banner's own commit announces the outcome on the page.
		await vi.waitFor(() =>
			expect($('consent-banner-announcement')?.textContent).not.toBe('')
		);
		expect(problems.filter((line) => /hydrat/iu.test(line))).toEqual([]);
	});
});
