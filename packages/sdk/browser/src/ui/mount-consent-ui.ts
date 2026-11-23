import { applyExperimentTheme } from '@inth/sdk-core';
import {
	activateOptOutLink,
	saveConsentSurfaceWithOptInCheck,
} from '@inth/sdk-core/surface-actions';
import { generateThemeCSS } from '@inth/sdk-ui/theme';
import type { Theme } from '@inth/sdk-ui/theme';
import { prefersReducedMotion } from '@inth/sdk-ui/utils/reduced-motion';

import type {
	ConsentClient,
	ConsentUIHandle,
	ConsentUIOptions,
} from '../consent-client.model';
import { dropRejection } from '../drop-rejection';
import { stylesheet } from '../generated/styles';
import { createSlotApplier } from './create-slot-applier';
import { createTrigger } from './create-trigger';
import { createStyle, createUIRoot } from './create-ui-root';
import { createDialog } from './dialog';
import { h } from './h';
import {
	subscribeOptInConfirmation,
	subscribeOptOutConfirmation,
	subscribeOptOutReceiptData,
} from './opt-out-confirmation-state';
import { createBannerSurface } from './prompt/prompt';
import type { Surface, SurfaceContext } from './surface.model';

const resolveContainer = function resolveContainer(
	container: ConsentUIOptions['container']
): HTMLElement {
	if (typeof container === 'string') {
		const found = document.querySelector<HTMLElement>(container);
		if (!found) {
			throw new Error(
				`@inth/sdk: UI container ${JSON.stringify(container)} not found.`
			);
		}
		return found;
	}
	return container ?? document.body;
};

const buildStyleText = function buildStyleText(
	options: ConsentUIOptions,
	theme: Theme | undefined,
	extraStyles = ''
): string {
	const parts: string[] = [];
	if (options.styles !== false && !options.noStyle) {
		parts.push(stylesheet);
		parts.push(extraStyles);
	}
	if (theme) {
		parts.push(generateThemeCSS(theme));
	}
	if (options.css) {
		parts.push(options.css);
	}
	return parts.join('\n');
};

/**
 * Add the `stylesheetUrls` links to the UI root.
 *
 * A nonce-based `style-src` blocks an unnonced `<link>`, even in a shadow
 * root, so each link carries the client's nonce. Call it after the stock
 * `<style>` is in place, so that sheet's `@layer` order statement comes
 * first: a Tailwind 4 sheet's utilities then outrank the stock components.
 */
const appendStylesheetLinks = function appendStylesheetLinks(
	root: ShadowRoot | HTMLElement,
	options: ConsentUIOptions,
	nonce: string | undefined
): void {
	for (const href of options.stylesheetUrls ?? []) {
		const link = h('link', { href, rel: 'stylesheet' });
		if (nonce) {
			link.nonce = nonce;
		}
		root.append(link);
	}
};

/**
 * Mount the banner, preference centre and trigger for a client.
 *
 * By default everything renders inside a shadow root on a host element
 * appended to `<body>`, carrying its own copy of the `@inth/sdk/ui`
 * stylesheet, so a Framer or WordPress theme's global `button {}` rules
 * cannot reach it. Pass `shadow: false` to render into the page and style
 * it yourself.
 *
 * Every part named in `theme.slots` carries its slot key as a CSS part, so
 * page CSS reaches it through `[data-inth-ui]::part(consentBannerCard)`
 * even inside the shadow root. A slot's classes need their rules in the
 * same root: in the page with `shadow: false`, or through `stylesheetUrls`
 * or `css` in shadow mode.
 *
 * @returns A handle that re-renders or tears down.
 * @throws {Error} When `container` is a selector that matches nothing.
 *
 * @example
 * ```ts
 * const client = createConsentClient({
 *   mode: hosted({ projectUrl: 'https://x.c15t.dev' }),
 * });
 * client.start();
 * mountConsentUI(client, { colorScheme: 'dark', trigger: true });
 * ```
 */
export const mountConsentUI = function mountConsentUI(
	client: ConsentClient,
	options: ConsentUIOptions = {},
	extension?: {
		stylesheet: string;
		createSurfaces: (ctx: SurfaceContext) => Surface[];
	}
): ConsentUIHandle {
	// The arm's theme overrides ride on the host theme. Assignment lands in
	// `start()`, before the UI mounts, so the first sheet already carries it;
	// `update()` re-renders the sheet if the arm changes later, and creates
	// it when a later arm is the first thing that needs one.
	const resolveTheme = function resolveTheme(): Theme | undefined {
		return applyExperimentTheme(
			options.theme,
			client.options.experiment,
			client.getSnapshot().experiment
		);
	};
	let renderedTheme = resolveTheme();
	const styleText = buildStyleText(
		options,
		renderedTheme,
		extension?.stylesheet
	);
	const { nonce } = client.options;
	const ui = createUIRoot(
		resolveContainer(options.container),
		options,
		styleText,
		nonce,
		(created) => {
			appendStylesheetLinks(created, options, nonce);
		}
	);
	const { host, releaseScheme, root, themeRoot } = ui;
	let styleEl = ui.style;

	let slotApplier = createSlotApplier(renderedTheme?.slots);
	const stylesOn = options.styles !== false && !options.noStyle;
	const addedSheets = new Set<string>();

	const ctx: SurfaceContext = {
		acceptFromBanner: () =>
			saveConsentSurfaceWithOptInCheck(
				client.kernel,
				'all',
				() =>
					client.kernel.commands.save('all', {
						categories: client.consentCategories,
						uiSource: 'banner',
					}),
				{ categories: client.consentCategories }
			),
		addSheets: (sheets) => {
			if (!stylesOn) {
				return;
			}
			for (const sheet of sheets) {
				if (addedSheets.has(sheet.id)) {
					continue;
				}
				addedSheets.add(sheet.id);
				// Before the stock `<style>`, which ends with the theme and the
				// `css` option, and the `stylesheetUrls` links after it: the
				// host's rules are documented to come last, and win ties. Each
				// sheet opens with the same `@layer` order statement as the
				// stock one, so the layer order is unchanged.
				const style = createStyle(sheet.css, nonce);
				style.setAttribute('data-inth-styles', sheet.id);
				root.insertBefore(
					style,
					styleEl?.parentNode === root ? styleEl : ui.wrapper
				);
			}
		},
		client,
		disableAnimation: options.disableAnimation ?? prefersReducedMotion(),
		legalLinks: client.options.legalLinks,
		noStyle: options.noStyle ?? false,
		onOptOutLink: (variant) => {
			dropRejection(
				activateOptOutLink(client.kernel, variant, { uiSource: 'banner' })
			);
		},
		root: themeRoot,
		// Surfaces keep this function; it reads the current arm's slots, which
		// `update()` swaps before the surfaces rebuild for the new arm.
		slot: (element, key) => slotApplier(element, key),
	};

	const surfaces: Surface[] = [];
	surfaces.push(...(extension?.createSurfaces(ctx) ?? []));
	if (options.banner !== false) {
		surfaces.push(
			createBannerSurface(
				ctx,
				options.banner === true ? {} : (options.banner ?? {})
			)
		);
	}
	if (options.dialog !== false) {
		surfaces.push(
			createDialog(
				ctx,
				options.dialog === true ? {} : (options.dialog ?? {}),
				options.trigger
			)
		);
	}
	if (options.trigger) {
		surfaces.push(
			createTrigger(ctx, options.trigger === true ? {} : options.trigger)
		);
	}

	const update = function update(): void {
		const snapshot = client.getSnapshot();
		const theme = resolveTheme();
		if (theme !== renderedTheme) {
			renderedTheme = theme;
			slotApplier = createSlotApplier(theme?.slots);
			const text = buildStyleText(options, theme, extension?.stylesheet);
			if (styleEl) {
				styleEl.textContent = text;
			} else if (text) {
				styleEl = createStyle(text, nonce);
				root.prepend(styleEl);
			}
		}
		for (const surface of surfaces) {
			surface.sync(snapshot);
		}
	};
	const unsubscribe = client.subscribe(update);
	const unsubscribeOptOut = subscribeOptOutConfirmation(client.kernel, update);
	const unsubscribeOptIn = subscribeOptInConfirmation(client.kernel, update);
	const unsubscribeOptOutReceipt = subscribeOptOutReceiptData(
		client.kernel,
		update
	);
	update();

	return {
		destroy() {
			unsubscribe();
			unsubscribeOptOut();
			unsubscribeOptIn();
			unsubscribeOptOutReceipt();
			releaseScheme();
			for (const surface of surfaces) {
				surface.destroy();
			}
			host.remove();
		},
		host,
		root,
		update,
	};
};
