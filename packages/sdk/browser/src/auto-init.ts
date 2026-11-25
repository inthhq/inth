import type {
	AllConsentNames,
	KernelOverrides,
	LegalLinks,
} from '@inth/sdk-core';

import type {
	ScriptTagClientOptions,
	ConsentDialogOptions,
	ConsentModeName,
	ConsentUIOptions,
} from './types';

/** Attribute that turns auto-init off so the page calls `inth.init()`. */
export const MANUAL_ATTRIBUTE = 'data-manual';

const MODES: ReadonlySet<string> = new Set<ConsentModeName>([
	'hosted',
	'manifest',
]);
const SCHEMES: ReadonlySet<string> = new Set(['light', 'dark', 'system']);

export const readList = function readList(
	value: string | null
): string[] | undefined {
	if (!value) {
		return undefined;
	}
	const items = value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
	return items.length > 0 ? items : undefined;
};

const readFlag = function readFlag(element: Element, name: string): boolean {
	const value = element.getAttribute(name);
	return value !== null && value !== 'false';
};

const readLegalLinks = function readLegalLinks(
	element: Element
): LegalLinks | undefined {
	const links: LegalLinks = {};
	const privacy = element.getAttribute('data-privacy-policy-url');
	const cookie = element.getAttribute('data-cookie-policy-url');
	const terms = element.getAttribute('data-terms-url');
	if (privacy) {
		links.privacyPolicy = { href: privacy };
	}
	if (cookie) {
		links.cookiePolicy = { href: cookie };
	}
	if (terms) {
		links.termsOfService = { href: terms };
	}
	return Object.keys(links).length > 0 ? links : undefined;
};

const readOverrides = function readOverrides(
	element: Element
): KernelOverrides | undefined {
	const overrides: KernelOverrides = {};
	const country = element.getAttribute('data-country');
	const region = element.getAttribute('data-region');
	const language = element.getAttribute('data-language');
	if (country) {
		overrides.country = country;
	}
	if (region) {
		overrides.region = region;
	}
	if (language) {
		overrides.language = language;
	}
	return Object.keys(overrides).length > 0 ? overrides : undefined;
};

/**
 * The CSP nonce the tag names: `data-nonce`, else the tag's own nonce.
 * Browsers hide a connected element's `nonce` content attribute, so the
 * property is read, not the attribute.
 *
 * @internal
 */
export const readNonce = function readNonce(
	element: Element
): string | undefined {
	const explicit = element.getAttribute('data-nonce');
	if (explicit) {
		return explicit;
	}
	const own = (element as Partial<HTMLOrSVGElement>).nonce;
	return typeof own === 'string' && own !== '' ? own : undefined;
};

/**
 * Read client options from a `<script>` tag's `data-*` attributes.
 *
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/@inth/sdk/lib/browser/dist/inth.js"
 *   data-project-url="https://your-project.inth.app"
 *   data-categories="measurement,marketing"
 *   data-color-scheme="dark"
 *   data-privacy-policy-url="/privacy"
 *   defer></script>
 * ```
 *
 * A `nonce` on the tag (or `data-nonce`) becomes the `nonce` option, so the
 * UI's `<style>` element passes a nonce-based CSP.
 *
 * @param element - The script element, or `null` outside a classic script.
 */
// oxlint-disable-next-line complexity -- One attribute per branch; a table would hide the shape.
export const readScriptOptions = function readScriptOptions(
	element: Element | null
): ScriptTagClientOptions {
	if (!element) {
		return {};
	}
	const options: ScriptTagClientOptions = {};
	const projectUrl =
		element.getAttribute('data-project-url') ??
		element.getAttribute('data-backend');
	if (projectUrl) {
		options.projectUrl = projectUrl;
	}
	const mode = element.getAttribute('data-mode');
	if (mode && MODES.has(mode)) {
		options.mode = mode as ConsentModeName;
	}
	const manifestUrl = element.getAttribute('data-manifest-url');
	if (manifestUrl) {
		options.manifestUrl = manifestUrl;
	}
	const categories = readList(element.getAttribute('data-categories'));
	if (categories) {
		options.consentCategories = categories as AllConsentNames[];
	}
	const overrides = readOverrides(element);
	if (overrides) {
		options.overrides = overrides;
	}
	const legalLinks = readLegalLinks(element);
	if (legalLinks) {
		options.legalLinks = legalLinks;
	}
	const nonce = readNonce(element);
	if (nonce) {
		options.nonce = nonce;
	}
	// On by default for a tag (see `createGlobalWith`); this turns it off.
	if (element.getAttribute('data-remote-scripts') === 'false') {
		options.remoteScripts = false;
	}
	if (readFlag(element, 'data-no-ui')) {
		options.ui = false;
		return options;
	}
	const ui: ConsentUIOptions = {};
	const surfaceOptions: ConsentDialogOptions = {};
	if (legalLinks) {
		surfaceOptions.legalLinks = Object.keys(legalLinks) as (keyof LegalLinks)[];
	}
	const scheme = element.getAttribute('data-color-scheme');
	if (scheme === 'none') {
		// An attribute cannot hold `null`; `none` is Astro's spelling of it.
		ui.colorScheme = null;
	} else if (scheme && SCHEMES.has(scheme)) {
		ui.colorScheme = scheme as ConsentUIOptions['colorScheme'];
	}
	if (element.getAttribute('data-shadow') === 'false') {
		ui.shadow = false;
	}
	if (readFlag(element, 'data-trigger')) {
		ui.trigger = true;
	}
	if (readFlag(element, 'data-disable-animation')) {
		ui.disableAnimation = true;
	}
	if (readFlag(element, 'data-hide-branding')) {
		surfaceOptions.hideBranding = true;
	}
	if (Object.keys(surfaceOptions).length > 0) {
		ui.banner = { ...surfaceOptions };
		ui.dialog = { ...surfaceOptions };
	}
	if (Object.keys(ui).length > 0) {
		options.ui = ui;
	}
	return options;
};

const mergeUI = function mergeUI(
	base: ScriptTagClientOptions['ui'],
	override: ScriptTagClientOptions['ui']
): ScriptTagClientOptions['ui'] {
	if (override === false || base === false) {
		return override ?? base;
	}
	if (!(base && override)) {
		return override ?? base;
	}
	const merged = { ...base, ...override };
	if (typeof base.banner === 'object' && typeof override.banner === 'object') {
		merged.banner = { ...base.banner, ...override.banner };
	}
	if (typeof base.dialog === 'object' && typeof override.dialog === 'object') {
		merged.dialog = { ...base.dialog, ...override.dialog };
	}
	return merged;
};

/**
 * Layer one options object over another. `ui` and its banner/dialog
 * option objects merge, so a queued `config` can change the branding
 * without discarding the script tag's legal links. Booleans replace
 * the corresponding UI or surface configuration.
 *
 * @param base - The options underneath.
 * @param override - The options on top.
 */
export const mergeClientOptions = function mergeClientOptions(
	base: ScriptTagClientOptions,
	override: ScriptTagClientOptions
): ScriptTagClientOptions {
	const merged: ScriptTagClientOptions = {
		...base,
		...override,
		ui: mergeUI(base.ui, override.ui),
	};
	if (merged.ui === undefined) {
		delete merged.ui;
	}
	return merged;
};

/**
 * Resolve the page's options: the script tag's attributes first, then each
 * queued `config` call on top, in order.
 *
 * @param configs - Options queued as `['config', options]` before load.
 * @returns Options and whether the page asked to init itself.
 */
export const readPageOptions = function readPageOptions(
	script: Element | null,
	configs: ScriptTagClientOptions[] = []
): { options: ScriptTagClientOptions; manual: boolean } {
	const options = configs.reduce(
		(merged, config) => mergeClientOptions(merged, config),
		readScriptOptions(script)
	);
	const manual = script !== null && readFlag(script, MANUAL_ATTRIBUTE);
	return { manual, options };
};
