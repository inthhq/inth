import { applyExperimentTheme } from '@inth/sdk-core';
import { generateThemeCSS } from '@inth/sdk-ui/theme';
import type { Theme } from '@inth/sdk-ui/theme';
import { prefersReducedMotion } from '@inth/sdk-ui/utils/reduced-motion';

import { stylesheet } from '../generated/styles';
import { takeInitUI } from '../init/adopt';
import type { AdoptedBanner, AdoptedDialog, InitUI } from '../init/boot';
import type {
	ConsentClient,
	ConsentUIHandle,
	ConsentUIOptions,
} from '../types';
import { createBanner } from './banner';
import { createDialog } from './dialog-surface';
import { h } from './dom';
import { applyColorScheme, createStyle, createUIRoot } from './root';
import type { UIRoot } from './root';
import { createSlotApplier } from './slots';
import type { Surface, SurfaceContext } from './surface';
import { createTrigger } from './trigger';

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

/** The dialog the init script opened, unless this mount has none. */
const takeInitDialog = function takeInitDialog(
	adopted: InitUI,
	options: ConsentUIOptions
): AdoptedDialog | undefined {
	const dialog = adopted.takeDialog() ?? undefined;
	if (dialog && options.dialog === false) {
		dialog.destroy();
		return undefined;
	}
	return dialog;
};

/**
 * The UI root to render into: the init script's, when it rendered the
 * banner where this mounts, else a new one.
 *
 * The init script's banner sheet becomes the full one, a superset, so
 * nothing on screen changes, and the banner it rendered is handed over
 * for the banner surface to take over.
 */
const mountRoot = function mountRoot(
	options: ConsentUIOptions,
	styleText: string,
	nonce: string | undefined,
	extended: boolean
): {
	ui: UIRoot;
	banner: AdoptedBanner | undefined;
	dialog: AdoptedDialog | undefined;
} {
	const adopted = takeInitUI(
		options.container === undefined &&
			(options.shadow ?? true) &&
			!extended &&
			!options.stylesheetUrls?.length
	);
	if (!adopted) {
		return {
			banner: undefined,
			dialog: undefined,
			ui: createUIRoot(
				resolveContainer(options.container),
				options,
				styleText,
				nonce,
				(root) => {
					appendStylesheetLinks(root, options, nonce);
				}
			),
		};
	}
	adopted.releaseScheme();
	if (adopted.style && styleText) {
		adopted.style.textContent = styleText;
	} else {
		adopted.style?.remove();
	}
	const banner = adopted.takeBanner() ?? undefined;
	if (banner && options.banner === false) {
		banner.release();
		banner.element.remove();
		banner.overlay?.remove();
	}
	return {
		banner: options.banner === false ? undefined : banner,
		dialog: takeInitDialog(adopted, options),
		ui: {
			...adopted,
			releaseScheme: applyColorScheme(
				adopted.wrapper,
				adopted.host,
				options.colorScheme === undefined ? 'system' : options.colorScheme
			),
			style: styleText ? adopted.style : null,
		},
	};
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
	const {
		banner: adoptedBanner,
		dialog: adoptedDialog,
		ui,
	} = mountRoot(options, styleText, nonce, extension !== undefined);
	const { host, releaseScheme, root, themeRoot } = ui;
	let styleEl = ui.style;

	let slotApplier = createSlotApplier(renderedTheme?.slots);

	const ctx: SurfaceContext = {
		client,
		disableAnimation: options.disableAnimation ?? prefersReducedMotion(),
		legalLinks: client.options.legalLinks,
		noStyle: options.noStyle ?? false,
		root: themeRoot,
		// Surfaces keep this function; it reads the current arm's slots, which
		// `update()` swaps before the surfaces rebuild for the new arm.
		slot: (element, key) => slotApplier(element, key),
	};

	const surfaces: Surface[] = [];
	surfaces.push(...(extension?.createSurfaces(ctx) ?? []));
	if (adoptedDialog) {
		// The dialog the init script opened, synced before the banner: it
		// holds the init script's scroll lock, which it must release before
		// a banner that locks scrolling takes this bundle's.
		surfaces.push(adoptedDialog.adopt(client));
	}
	if (options.banner !== false) {
		surfaces.push(
			createBanner(
				ctx,
				options.banner === true ? {} : (options.banner ?? {}),
				adoptedBanner
			)
		);
	}
	if (options.dialog !== false && !adoptedDialog) {
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
	update();

	return {
		destroy() {
			unsubscribe();
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
