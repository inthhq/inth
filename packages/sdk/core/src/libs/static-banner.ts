/**
 * The static banner a client-rendered page's `index.html` carries, and the
 * inline script that decides whether to show it.
 *
 * `consentManifest()` renders the stock banner at build time, for the
 * manifest's choice policy, and puts it in `index.html` hidden. The page's
 * inline `/v1/consent/init` prefetch answers long before the app's JavaScript has run;
 * when the answer names the same policy, language, branding and banner copy,
 * and the visitor has no stored choice, this script shows the banner. Any
 * other answer removes it, and the app renders its banner as before. The
 * app's banner takes the static one's place when it renders.
 *
 * @packageDocumentation
 * @internal
 */

import { PREFETCH_WINDOW_KEY } from './page-globals';
import { STORED_NAMES_CHECK } from './storage-keys';

/** Attribute on the element that wraps the static banner. @internal */
export const STATIC_BANNER_ATTR = 'data-inth-static-banner';

/** What the reveal script compares the `/v1/consent/init` answer with. @internal */
export interface StaticBannerKey {
	/** `policyResolution.fingerprints.policy` of the rendered policy. */
	policy: string;
	/** `translations.language` the banner was rendered in. */
	language: string;
	/** `branding` the banner was rendered with. */
	branding: string | null;
	/** {@link staticBannerCopyHash} of the rendered copy. */
	copy: number;
}

/** The copy the stock choice banner renders, in a fixed order. */
const COPY_PATHS = [
	['cookieBanner', 'title'],
	['cookieBanner', 'description'],
	['common', 'acceptAll'],
	['common', 'rejectAll'],
	['common', 'customize'],
	['common', 'securedBy'],
] as const;

/**
 * FNV-1a over the banner copy, as the reveal script computes it from the
 * `/v1/consent/init` translations.
 *
 * @param translations - `translations.translations` of a `/v1/consent/init` answer.
 * @returns An unsigned 32-bit hash.
 * @internal
 */
export const staticBannerCopyHash = function staticBannerCopyHash(
	translations: unknown
): number {
	const source = COPY_PATHS.map(([group, key]) => {
		const value = ((
			translations as Record<string, Record<string, unknown> | undefined>
		)?.[group] ?? {})[key];
		return typeof value === 'string' ? value : '';
	}).join('\n');
	let hash = 2_166_136_261;
	for (let index = 0; index < source.length; index += 1) {
		// oxlint-disable-next-line no-bitwise -- FNV-1a, as the inline script computes it.
		hash = Math.imul(hash ^ source.charCodeAt(index), 16_777_619) >>> 0;
	}
	return hash;
};

/**
 * Source of the inline script that follows the static banner. It shows the
 * banner when the page's prefetched `/v1/consent/init` names the banner's policy,
 * language, branding and copy, and nothing is stored under the consent
 * storage keys; otherwise it removes it. A stored choice removes it before
 * `/v1/consent/init` answers, so a returning visitor never sees it.
 *
 * Plain ES5 apart from `Promise`, which the prefetch script already uses.
 * Must directly follow the banner's wrapper element.
 *
 * @param key - What the rendered banner shows.
 * @param stored - Names that hold a choice or a notice dismissal
 * (`storedChoiceNames`).
 * @returns Script source, without the `<script>` tag.
 * @internal
 */
export const buildStaticBannerScript = function buildStaticBannerScript(
	key: StaticBannerKey,
	stored: readonly string[]
): string {
	const config = JSON.stringify({
		b: key.branding,
		c: key.copy,
		f: key.policy,
		k: stored,
		l: key.language,
		x: COPY_PATHS,
	});
	return `(function(w,d,p){var e=d.currentScript,b=e&&e.previousElementSibling,m,k,o,H=${STORED_NAMES_CHECK};function x(){b&&b.parentNode&&b.parentNode.removeChild(b)}function s(){return H(p.k)}function h(t){var v=p.x.map(function(a){var g=t&&t[a[0]],y=g&&g[a[1]];return typeof y==='string'?y:''}).join('\\n'),n=2166136261,i;for(i=0;i<v.length;i++)n=Math.imul(n^v.charCodeAt(i),16777619)>>>0;return n}if(!b||!b.hasAttribute('${STATIC_BANNER_ATTR}'))return;if(s())return x();m=w['${PREFETCH_WINDOW_KEY}'];for(k in m)if(o){o=0;break}else o=m[k];if(!o)return x();o.promise.then(function(r){var i=r&&r.init,q=i&&i.policyResolution,t=i&&i.translations;if(b.parentNode&&q&&q.status==='matched'&&q.fingerprints&&q.fingerprints.policy===p.f&&t&&t.language===p.l&&(i.branding||null)===p.b&&!i.gvl&&!i.gvlReference&&!(i.vendors&&i.vendors.length)&&!(i.customVendors&&i.customVendors.length)&&h(t.translations)===p.c&&!s())b.hidden=false;else x()},x)})(window,document,${config})`;
};
