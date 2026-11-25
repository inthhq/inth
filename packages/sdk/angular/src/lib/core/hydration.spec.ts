/**
 * The browser hydrating what the server rendered: the banner keeps the
 * server's nodes, and a tap the early-tap script held before hydration
 * still lands when the prompt's container chunk fails.
 */
import {
	ChangeDetectionStrategy,
	Component,
	provideZonelessChangeDetection,
} from '@angular/core';
import type { ApplicationRef, Provider } from '@angular/core';
import {
	bootstrapApplication,
	provideClientHydration,
} from '@angular/platform-browser';
import {
	provideServerRendering,
	renderApplication,
} from '@angular/platform-server';
import { EARLY_TAP_STYLE_ID } from '@inth/sdk/runtime/page-globals';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
} from '@inth/sdk/schema/types';
import { EARLY_CONSENT_TAP_SCRIPT } from '@inth/sdk/surface-actions';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { testOptions } from '../../__tests__/test-local';
import { ConsentBanner } from '../prompt/prompt';
import { PROMPT_LOADERS } from '../prompt/prompt-loaders';
import type { ContainerModule } from '../prompt/prompt-loaders';
import { ConsentManager } from './consent-manager';
import { provideInth } from './provide-inth';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner],
	selector: 'app-root',
	template: `<inth-consent-banner />`,
})
class App {}

const EARLY_TAPS = '__inthEarlyTaps';
const BANNER = '[data-testid="consent-banner-root"]';

const policy = normalizePolicyRule({
	id: 'hydrate',
	match: { fallback: true },
	model: 'opt-in',
	prompt: 'choice',
	scopeMode: 'permissive',
});

/** `undefined` keeps persistence on, so the engine loads deferred. */
const inth = (persistence: false | undefined) =>
	provideInth({
		...testOptions(),
		persistence,
		prefetch: {
			initialPolicyResolution: {
				fingerprints: createPolicyRuleFingerprints(policy),
				matchedBy: 'fallback',
				policy,
				policyId: policy.id,
				status: 'matched',
			},
		},
	});

let app: ApplicationRef | undefined;

/** Render on the server and put the page in the document, as a browser would. */
const serverPage = async (persistence: false | undefined): Promise<void> => {
	const html = await renderApplication(
		(context) =>
			bootstrapApplication(
				App,
				{
					providers: [
						provideZonelessChangeDetection(),
						provideServerRendering(),
						provideClientHydration(),
						inth(persistence),
					],
				},
				context
			),
		{
			document: '<html><head></head><body><app-root></app-root></body></html>',
			url: '/',
		}
	);
	const parsed = new DOMParser().parseFromString(html, 'text/html');
	document.head.innerHTML = parsed.head.innerHTML;
	document.body.innerHTML = parsed.body.innerHTML;
};

const hydrate = async (
	persistence: false | undefined,
	providers: Provider[] = []
): Promise<ApplicationRef> => {
	app = await bootstrapApplication(App, {
		providers: [
			provideZonelessChangeDetection(),
			provideClientHydration(),
			inth(persistence),
			...providers,
		],
	});
	return app;
};

// A server render and a hydration per test: slow under a full parallel run.
vi.setConfig({ testTimeout: 20_000 });

afterEach(() => {
	app?.destroy();
	app = undefined;
	document.head.replaceChildren();
	document.body.replaceChildren();
	// The script's listeners outlive the page it ran on here.
	(window as unknown as Record<string, { stop?: () => void } | undefined>)[
		EARLY_TAPS
	]?.stop?.();
	Reflect.deleteProperty(window, EARLY_TAPS);
	// Persistence is on: a recorded choice would owe the next page nothing.
	localStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; Max-Age=0; Path=/`;
		}
	}
});

describe('hydration', () => {
	test.each([
		['the deferred engine', undefined],
		['the engine at once', false],
	] as const)(
		"keeps the server's consent-banner-root node, on %s",
		async (_, persistence) => {
			await serverPage(persistence);
			const server = document.querySelector(BANNER);
			expect(server).not.toBeNull();
			await (await hydrate(persistence)).whenStable();
			await vi.waitFor(() =>
				expect(document.querySelector(BANNER)).toBe(server)
			);
		}
	);
});

describe('a tap before hydration, on the server banner', () => {
	/**
	 * The server's banner, with the inline script that holds a tap on it
	 * until the prompt hydrates, then a tap on Accept. The prompt loads its
	 * container through a loader that fails `failures` times first.
	 */
	const tapThenHydrate = async (failures: number, action = 'accept') => {
		await serverPage(undefined);
		// oxlint-disable-next-line no-new-func -- The script ships as text.
		new Function(EARLY_CONSENT_TAP_SCRIPT)();
		document
			.querySelector<HTMLButtonElement>(`${BANNER} [data-action="${action}"]`)
			?.click();
		// The script held the tap, and hid the banner for a choice.
		expect(document.getElementById(EARLY_TAP_STYLE_ID) !== null).toBe(
			action !== 'customize'
		);
		let left = failures;
		const container = vi.fn(async (): Promise<ContainerModule> => {
			if (left > 0) {
				left -= 1;
				throw new Error('The container chunk failed to load.');
			}
			return (await import('../prompt/card-container')).CARD_CONTAINER;
		});
		const hydrated = await hydrate(undefined, [
			{
				provide: PROMPT_LOADERS,
				useValue: {
					container,
					surface: async () =>
						(await import('../prompt/prompt-surface')).PromptSurface,
				},
			},
		]);
		return { consent: hydrated.injector.get(ConsentManager), container };
	};

	test.each([0, 1])(
		'the held Accept records once the prompt renders, after %i failed container loads',
		async (failures) => {
			const { consent, container } = await tapThenHydrate(failures);
			await vi.waitFor(() => expect(consent.has('marketing')).toBe(true), {
				timeout: 4000,
			});
			expect(container).toHaveBeenCalled();
			await vi.waitFor(() =>
				expect(document.getElementById(EARLY_TAP_STYLE_ID)).toBeNull()
			);
		}
	);

	test('a held Customize opens the options once a later load renders the banner the failed one lost', async () => {
		const { consent, container } = await tapThenHydrate(1, 'customize');
		await vi.waitFor(
			() =>
				expect(
					document
						.querySelector('[data-testid="consent-banner-expand-panel"]')
						?.getAttribute('data-open')
				).toBe('true'),
			{ timeout: 4000 }
		);
		expect(container).toHaveBeenCalledTimes(2);
		expect(consent.activeUI()).toBe('banner');
	});

	test('a container chunk that keeps failing drops the hiding style', async () => {
		const { consent, container } = await tapThenHydrate(
			Number.POSITIVE_INFINITY
		);
		await vi.waitFor(() => expect(container).toHaveBeenCalled());
		await vi.waitFor(
			() => expect(document.getElementById(EARLY_TAP_STYLE_ID)).toBeNull(),
			{ timeout: 4000 }
		);
		expect(consent.has('marketing')).toBe(false);
	});
});
