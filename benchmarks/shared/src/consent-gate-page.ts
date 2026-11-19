/**
 * Browser-safe parts of the consent gate fixture, imported by every gate page.
 *
 * Each framework bench serves two routes built from this module: a gate page
 * (article, Inth banner and dialog, two gated scripts) and a control page (the
 * same article without any consent library). The runner in `consent-gate.ts`
 * measures both behind a proxy that serves the hero image and the gated
 * scripts, so every framework loads the same bytes besides its own.
 *
 * The article markup and stylesheet are copied from CookieBench's shared
 * reference page (`packages/fixture-support/src/page.ts`, inthhq/cookiebench,
 * revision `article-workload-v1`), and the bridge from its
 * `fixture-support/src/browser.ts`, so the gate's metrics read the same page
 * and the same public state CookieBench does. The reading-list workload that
 * page also loads is left out: it is the same for every arm and adds a
 * request the gate does not need.
 */

/** Path the gate proxy serves the hero image from. */
export const GATE_HERO_PATH = '/__gate/hero.png';

/** Path the gate proxy serves gated scripts from. */
export const GATE_SCRIPT_PATH = '/__gate/script.js';

/** Global the bridge writes and the observer reads, CookieBench's name. */
export const GATE_STATE_GLOBAL = '__cookiebench';

/** Categories every gate page configures, as CookieBench's fixtures do. */
export const gateConsentCategories = [
	'necessary',
	'measurement',
	'marketing',
] as const;

/** Optional categories an Accept must grant before consent is effective. */
export const gateAcceptCategories = ['measurement', 'marketing'] as const;

/** Selectors the runner taps and watches on every stock Inth banner. */
export const gateSelectors = {
	accept: '[data-testid="consent-banner-accept-button"]',
	banner: '[data-testid="consent-banner-root"]',
	customize: '[data-testid="consent-banner-customize-button"]',
	overlay:
		'[data-testid="consent-dialog-overlay"], [data-testid="consent-banner-overlay"]',
	preferencesLink:
		'[data-testid="consent-dialog-link"], [data-testid="consent-dialog-trigger"]',
	preferencesPanel: '[data-testid="consent-dialog-root"]',
	preferencesReject: '[data-testid="consent-widget-reject-button"]',
	primaryContent: '#primary-content',
	ready: 'html[data-consent-ready="true"]',
} as const;

/** The article page CookieBench measures, with the hero served by the gate proxy. */
export const gatePageHTML = `<header class="site-header"><a href="/">Field notes</a><nav aria-label="Main"><a href="#story">Read the story</a><a href="#reading">Reading list</a></nav></header><main><article id="story"><p class="eyebrow">Architecture and everyday places</p><h1>A quieter corner of the city</h1><p class="intro">A walk through the spaces where people stop, meet, and make room for one another.</p><img id="primary-content" class="hero" src="${GATE_HERO_PATH}" width="1200" height="640" fetchpriority="high" elementtiming="primary-content" alt="An illustrated courtyard with trees, benches, and warm brick buildings"/><div class="story-grid"><section><h2>Built for a pause</h2><p>The courtyard sits behind a row of shops. In the morning, its long benches catch the first light. At lunch, neighbours bring coffee and trade news while the street keeps moving outside.</p><p>Small changes made this shared space more useful. A path connects both entrances. Trees give shade without closing off the view. The chairs are light enough to move.</p><p>Good public places leave room for the ordinary. There is somewhere to sit, a clear way through, and enough space to stay for a while.</p></section><aside id="reading"><h2>Keep exploring</h2><p>Save this story to your reading list.</p><button id="page-action" type="button">Save story</button><p id="page-result" aria-live="polite"></p></aside></div></article></main><footer>inth consent gate reference page, after CookieBench's article. Every framework uses this same content.</footer>`;

/** CookieBench's reference stylesheet, inlined by every gate and control page. */
export const gatePageCSS = `:root{font-family:system-ui,sans-serif;color:#223326;background:#f7f7f1;font-synthesis:none}*{box-sizing:border-box}body{margin:0}.site-header,main,footer{max-width:1060px;margin:auto;padding:24px}.site-header{display:flex;justify-content:space-between;border-bottom:1px solid #cbd1c6}.site-header>a{font-weight:700}nav{display:flex;gap:24px}a{color:inherit;text-underline-offset:3px}.eyebrow{margin-top:40px;color:#4c624f;font-size:14px}h1{font-size:clamp(32px,5vw,56px);line-height:1.1;max-width:800px;margin:16px 0}.intro{font-size:20px;max-width:720px;line-height:1.5}.hero{display:block;width:100%;height:auto;aspect-ratio:1200/640;margin:28px 0}.story-grid{display:grid;grid-template-columns:2fr 1fr;gap:48px}p{line-height:1.65}button,select{font:inherit;padding:12px 18px;cursor:pointer}footer{border-top:1px solid #cbd1c6;font-size:13px;margin-top:32px}button:focus-visible,a:focus-visible{outline:3px solid #285fc2;outline-offset:4px}@media(max-width:600px){.story-grid{grid-template-columns:1fr;gap:16px}.site-header{align-items:start;gap:16px}nav{flex-direction:column;gap:8px}}`;

/** One gated script in Inth's `scripts` / `useScriptLoader` shape. */
export interface GateScript {
	id: string;
	category: (typeof gateAcceptCategories)[number];
	src: string;
}

/**
 * The two gated scripts every gate page registers, one per optional
 * category, as CookieBench's default `?scripts=2` workload does. Each one
 * records its execution time in the bridge when it runs.
 */
export const gateScripts = function gateScripts(): GateScript[] {
	return gateAcceptCategories.map((category, index) => ({
		category,
		id: `gate-script-${index}`,
		src: `${GATE_SCRIPT_PATH}?id=gate-script-${index}&category=${category}`,
	}));
};

/** Consent state the observer reads, CookieBench's `FixtureBridge`. */
export interface GateBridge {
	consent: 'unset' | 'accepted' | 'rejected' | 'custom';
	allowedCategories: string[];
	scripts: { id: string; category: string; at: number }[];
	ready?: boolean;
	resolvedAt?: number;
}

/** The public snapshot fields the bridge reads from any Inth adapter. */
export interface GateSnapshot {
	explicitChoice?: {
		categories: Readonly<Record<string, { value: boolean } | undefined>>;
	} | null;
	effectivePermissions?: Readonly<Record<string, boolean | undefined>>;
	resolution?: { status?: string } | null;
}

/** Create the bridge once per document. Safe on the server. */
export const initializeGateBridge = function initializeGateBridge():
	| GateBridge
	| undefined {
	if (typeof window === 'undefined') {
		return undefined;
	}
	const target = window as unknown as Record<string, GateBridge | undefined>;
	target[GATE_STATE_GLOBAL] ??= {
		allowedCategories: [],
		consent: 'unset',
		scripts: [],
	};
	return target[GATE_STATE_GLOBAL];
};

/**
 * Publish a Inth snapshot to the bridge. Copied from CookieBench's
 * `updateBridge`: consent is effective when `effectivePermissions` grants
 * the categories, and the page is ready when policy resolution matched.
 */
export const updateGateBridge = function updateGateBridge(
	snapshot: GateSnapshot
): void {
	const bridge = initializeGateBridge();
	if (!bridge) {
		return;
	}
	bridge.allowedCategories = Object.entries(snapshot.effectivePermissions ?? {})
		.filter(([category, allowed]) => category !== 'necessary' && allowed)
		.map(([category]) => category);
	const choices = Object.entries(snapshot.explicitChoice?.categories ?? {})
		.filter(([category]) => category !== 'necessary')
		.map(([, choice]) => choice);
	bridge.consent = 'unset';
	if (snapshot.explicitChoice && choices.length) {
		if (choices.every((choice) => choice?.value)) {
			bridge.consent = 'accepted';
		} else if (choices.every((choice) => !choice?.value)) {
			bridge.consent = 'rejected';
		} else {
			bridge.consent = 'custom';
		}
	}
	bridge.ready = snapshot.resolution?.status === 'matched';
	if (bridge.ready && bridge.resolvedAt === undefined) {
		bridge.resolvedAt = performance.now();
	}
	document.documentElement.dataset.consentReady = String(bridge.ready);
};
