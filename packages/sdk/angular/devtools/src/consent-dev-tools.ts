/**
 * The c15t DevTools panel for an Angular app, bound to the app's consent
 * runtime.
 *
 * @packageDocumentation
 */

import { isPlatformBrowser } from '@angular/common';
import {
	booleanAttribute,
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
	makeEnvironmentProviders,
	PLATFORM_ID,
	provideEnvironmentInitializer,
	untracked,
} from '@angular/core';
import type { EnvironmentProviders, Signal } from '@angular/core';
import { ConsentManager } from '@inth/angular';
import { createDevTools } from '@inth/sdk/devtools';
import type { DevToolsOptions } from '@inth/sdk/devtools';
import { publishDevToolsLauncher } from '@inth/sdk/ui/utils/devtools-launcher';

/**
 * DevTools options: everything `createDevTools()` from `@inth/sdk/devtools`
 * takes, except the kernel and container, which come from the app.
 *
 * Without `clearRecords`, `getPresentation` or `getConsentCategories`,
 * the panel uses `ConsentManager`'s.
 */
export type ConsentDevToolsOptions = Omit<
	DevToolsOptions,
	'container' | 'embedded' | 'kernel'
>;

/**
 * Mount the panel for `consent`'s kernel while the calling injection
 * context lives, in the browser only. Remounts when the displayed
 * categories, a view setting or the kernel changes; the callbacks are read
 * when the panel calls them, so a new function takes effect without a
 * remount.
 */
const mountDevTools = function mountDevTools(
	options: Signal<ConsentDevToolsOptions>
): void {
	if (!isPlatformBrowser(inject(PLATFORM_ID))) {
		return;
	}
	const consent = inject(ConsentManager);
	// The consent engine's own kernel: modules such as the script loader
	// register with it, and the panel reads them from there. The panel
	// mounts once the engine's chunk has loaded, so it does not remount under
	// a visitor's hands. If the first load fails it mounts on the manager's
	// kernel, and moves to the engine's when a retry attaches it.
	const standIn = untracked(consent.kernel);
	const engineKernel = computed(
		() => consent.ɵengine() ?? (consent.ɵengineSettled() ? standIn : null)
	);
	// Snapshot updates can return a new array with the same categories. Only
	// recreate the panel when the displayed scope actually changes.
	const viewKey = computed(() => {
		const {
			defaultOpen,
			defaultTab,
			getConsentCategories,
			maxEvents,
			position,
			shadow,
		} = options();
		const categories = [
			...new Set(getConsentCategories?.() ?? consent.consentCategories()),
		].sort();
		return JSON.stringify({
			categories,
			defaultOpen,
			defaultTab,
			maxEvents,
			position,
			shadow,
		});
	});

	effect((onCleanup) => {
		const { categories, ...settings } = JSON.parse(viewKey()) as Pick<
			ConsentDevToolsOptions,
			'defaultOpen' | 'defaultTab' | 'maxEvents' | 'position' | 'shadow'
		> & {
			categories: ReturnType<
				NonNullable<ConsentDevToolsOptions['getConsentCategories']>
			>;
		};
		// A kernel the manager swapped in later (`enabled` toggled) wins.
		const rendered = consent.kernel();
		const kernel = rendered === standIn ? engineKernel() : rendered;
		if (!kernel) {
			return;
		}
		const current = () => untracked(options);
		const devTools = untracked(() =>
			createDevTools({
				...settings,
				clearRecords: () => {
					const clear = current().clearRecords;
					if (clear) {
						clear();
					} else {
						consent.clearRecords();
					}
				},
				getConsentCategories: () => categories,
				getPresentation: () => {
					const get = current().getPresentation;
					return get ? get() : untracked(consent.presentation);
				},
				kernel,
			})
		);
		// A visible `<c15t-consent-dialog-trigger>` for the same kernel can
		// render the launcher instead.
		const withdrawLauncher = publishDevToolsLauncher(kernel, devTools);
		onCleanup(() => {
			withdrawLauncher();
			devTools.destroy();
		});
	});
};

/** `booleanAttribute`, keeping `undefined` so the panel's default applies. */
const optionalBoolean = (value: unknown): boolean | undefined =>
	value === undefined ? undefined : booleanAttribute(value);

/**
 * Renders the c15t DevTools panel for the app's consent runtime: consent
 * state, policy, events and actions. Place it once, anywhere under
 * `provideC15t()`. It renders nothing itself; the panel mounts in its own
 * shadow root on `<body>` in the browser and is removed with the
 * component.
 *
 * Gate it to development builds yourself. Inside `@defer`, the panel code
 * is a lazy chunk that a production page never requests.
 *
 * @example
 * ```ts
 * import { Component, isDevMode } from '@angular/core';
 * import { ConsentDevTools } from '@inth/angular/devtools';
 *
 * @Component({
 *   selector: 'app-root',
 *   imports: [ConsentDevTools],
 *   template: `
 *     @if (dev) {
 *       @defer { <c15t-consent-dev-tools position="bottom-left" /> }
 *     }
 *   `,
 * })
 * export class App {
 *   protected readonly dev = isDevMode();
 * }
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'c15t-consent-dev-tools',
	styles: ':host { display: none; }',
	template: '',
})
export class ConsentDevTools {
	/** Clears the stored records. Defaults to `ConsentManager.clearRecords()`. */
	readonly clearRecords = input<ConsentDevToolsOptions['clearRecords']>();
	/** The presentation the Policy tab shows. Defaults to the provider's. */
	readonly getPresentation = input<ConsentDevToolsOptions['getPresentation']>();
	/** The categories the panel lists. Defaults to `consentCategories()`. */
	readonly getConsentCategories =
		input<ConsentDevToolsOptions['getConsentCategories']>();
	/**
	 * Open the panel on mount. A bare `defaultOpen` attribute counts as
	 * `true`.
	 */
	readonly defaultOpen = input<boolean | undefined, unknown>(undefined, {
		transform: optionalBoolean,
	});
	/** The tab shown first. */
	readonly defaultTab = input<ConsentDevToolsOptions['defaultTab']>();
	/** How many events the Events tab keeps. */
	readonly maxEvents = input<ConsentDevToolsOptions['maxEvents']>();
	/** The corner the launcher sits in. */
	readonly position = input<ConsentDevToolsOptions['position']>();
	/** Render inside a shadow root. A bare `shadow` attribute counts as `true`. */
	readonly shadow = input<boolean | undefined, unknown>(undefined, {
		transform: optionalBoolean,
	});

	constructor() {
		mountDevTools(
			computed(() => ({
				clearRecords: this.clearRecords(),
				defaultOpen: this.defaultOpen(),
				defaultTab: this.defaultTab(),
				getConsentCategories: this.getConsentCategories(),
				getPresentation: this.getPresentation(),
				maxEvents: this.maxEvents(),
				position: this.position(),
				shadow: this.shadow(),
			}))
		);
	}
}

/**
 * Mounts the c15t DevTools panel with the application, without a
 * component. Add it after `provideC15t()`.
 *
 * A static import ships the panel in every build, even behind
 * `isDevMode()`. Keep it out of production by adding it in a
 * development-only config, such as one swapped in with `fileReplacements`,
 * or use {@link ConsentDevTools} inside `@defer`.
 *
 * @param options - Panel options.
 * @returns Providers for `bootstrapApplication` or an `ApplicationConfig`.
 * @example
 * ```ts
 * // app.config.development.ts
 * import { hosted, provideC15t } from '@inth/angular';
 * import { provideC15tDevTools } from '@inth/angular/devtools';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideC15t({ mode: hosted({ projectUrl: '/api/c15t' }) }),
 *     provideC15tDevTools({ position: 'bottom-left' }),
 *   ],
 * };
 * ```
 */
export const provideC15tDevTools = function provideC15tDevTools(
	options: ConsentDevToolsOptions = {}
): EnvironmentProviders {
	return makeEnvironmentProviders([
		provideEnvironmentInitializer(() => {
			mountDevTools(computed(() => options));
		}),
	]);
};
