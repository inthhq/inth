/**
 * Node-only: the static banner `consentManifest()` puts in a client-rendered
 * page's `index.html`. See `libs/static-banner.model.ts` for what the page does
 * with it.
 *
 * @packageDocumentation
 * @internal
 */
import { join } from 'node:path';

import type { ConsentManifest, InitOutput } from '@inth/sdk-schema/types';

import {
	buildStaticBannerScript,
	STATIC_BANNER_ATTR,
	staticBannerCopyHash,
} from './libs/static-banner.model';
import { storedChoiceNames } from './libs/storage-keys';
import { resolveManifestInit } from './transports/manifest-cache';

/** A stylesheet from `@inth/sdk/ui/styles/sheets/*`. */
export interface StaticBannerSheet {
	id: string;
	css: string;
}

/** What `@inth/react/static-banner` exports. @internal */
export interface StaticBannerRenderer {
	/** The banner's stylesheets, in cascade order. */
	STATIC_BANNER_SHEETS: readonly StaticBannerSheet[];
	/**
	 * The stock banner's markup for a `/v1/consent/init` answer, or `undefined` when
	 * that answer shows no choice banner the static one can stand in for.
	 */
	renderStaticBanner: (init: InitOutput) => string | undefined;
	/**
	 * The sheets a page needs for `markup`: the shared ones and the
	 * container it shows. A client banner in another container loads that
	 * container's own. Without markup, every container's, as
	 * `STATIC_BANNER_SHEETS`. Absent from releases before it, which inline
	 * every container's.
	 */
	staticBannerSheets?: (
		markup: string | undefined
	) => readonly StaticBannerSheet[];
}

/**
 * Sheets `@inth/react` imports that a page with the static banner or a
 * server-rendered banner already holds (`tokens`, `button`, `surface` and
 * the containers `card`, `banner` and `drawer`), or that only a surface
 * rendered later needs (`trigger`, `consent-gate`); `first-paint` is the
 * one earlier `@inth/react` releases rendered for the IAB banner. A client
 * build gets each one's `-deferred` module: the same `id`, no text, and a
 * `load()` used only when the page lacks the sheet. A sheet the installed
 * `@inth/sdk/ui` has no deferred module for keeps its text.
 */
export const DEFERRED_SHEET_SPECIFIERS: readonly string[] = [
	'first-paint',
	'tokens',
	'button',
	'surface',
	'card',
	'banner',
	'drawer',
	'trigger',
	'consent-gate',
].map((name) => `@inth/sdk/ui/styles/sheets/${name}`);
const DEFERRED_SHEETS: ReadonlySet<string> = new Set(DEFERRED_SHEET_SPECIFIERS);

/** A module of the installed `@inth/react`, whatever the package manager. */
const REACT_PACKAGE = /[\\/]node_modules[\\/]@inth[\\/]react[\\/]/u;

/**
 * The stock banner's component in `@inth/react`'s build, or the
 * `ConsentBanner` a browser build imports (`deferred/client-banner.js`),
 * which loads that component in a chunk of its own.
 */
const BANNER_MODULE =
	/[\\/]@inth[\\/]react[\\/]dist[\\/](?:components[\\/]prompt[\\/]prompt|deferred[\\/]client-banner)\.js$/u;

/**
 * The `-deferred` twin of a sheet `@inth/react` imports, or `undefined` for
 * any other import.
 *
 * @internal
 */
export const deferredSheetSpecifier = function deferredSheetSpecifier(
	id: string,
	importer: string | undefined
): string | undefined {
	return importer && REACT_PACKAGE.test(importer) && DEFERRED_SHEETS.has(id)
		? `${id}-deferred`
		: undefined;
};

/** `@inth/react`'s `ConsentBanner` export, by its package import. */
const CONSENT_BANNER_IMPORT = '#consent-banner';

/**
 * The browser `ConsentBanner` for `@inth/react`'s `#consent-banner`, when
 * the importer is the installed `@inth/react`: a gate that loads the stock
 * banner in a chunk of its own. A page with the static banner shows that
 * one until its client loads, so the banner's code need not be in the
 * page's first-load JavaScript. Any other import is `undefined`.
 *
 * @returns The gate's path in the importer's `@inth/react`.
 * @internal
 */
export const clientBannerPath = function clientBannerPath(
	id: string,
	importer: string | undefined
): string | undefined {
	if (
		id !== CONSENT_BANNER_IMPORT ||
		!(importer && REACT_PACKAGE.test(importer))
	) {
		return undefined;
	}
	const match = REACT_PACKAGE.exec(importer);
	return match
		? join(
				importer.slice(0, match.index + match[0].length),
				'dist/deferred/client-banner.js'
			)
		: undefined;
};

/** The slice of a Rolldown output chunk the page lookup reads. */
export interface StaticBannerChunk {
	type?: string;
	imports?: readonly string[];
	moduleIds?: readonly string[];
}

/**
 * Where the `@inth/react` a page's entry loads statically is installed,
 * when that includes the stock banner, or the browser `ConsentBanner` that
 * loads it; otherwise `undefined`. A page that imports the banner only in
 * a lazy chunk of its own, or no Inth at all, such as a second entry, gets
 * nothing.
 *
 * @internal
 */
export const findPageBanner = function findPageBanner(
	chunk: StaticBannerChunk,
	bundle: Readonly<Record<string, StaticBannerChunk>>
): string | undefined {
	const seen = new Set<StaticBannerChunk>();
	const queue = [chunk];
	for (let next = queue.pop(); next; next = queue.pop()) {
		if (seen.has(next)) {
			continue;
		}
		seen.add(next);
		const banner = next.moduleIds?.find((id) => BANNER_MODULE.test(id));
		if (banner) {
			const match = REACT_PACKAGE.exec(banner);
			return match
				? banner.slice(0, match.index + match[0].length - 1)
				: undefined;
		}
		for (const file of next.imports ?? []) {
			const imported = bundle[file];
			if (imported?.type === 'chunk') {
				queue.push(imported);
			}
		}
	}
	return undefined;
};

/**
 * Resolver inputs that land on each policy pack, in manifest order: its
 * first country or region, or no location for the fallback and default
 * packs.
 */
const packInputs = function packInputs(
	manifest: ConsentManifest,
	language: string
) {
	const packs = (manifest as { policyPacks?: unknown[] }).policyPacks ?? [];
	return packs.map((pack) => {
		const match =
			(
				pack as {
					match?: {
						countries?: string[];
						regions?: { country: string; region: string }[];
					};
				}
			).match ?? {};
		const region = match.regions?.[0];
		return {
			country: match.countries?.[0] ?? region?.country ?? null,
			gpc: false,
			language,
			region: region?.region ?? null,
		};
	});
};

/**
 * Names holding a choice or a notice dismissal: what the client-rendered
 * provider reads to load the engine at once instead of showing a banner.
 */
const storedNames = function storedNames(storageKey: string | undefined) {
	const names = storedChoiceNames({ storageKey });
	return [...names.choice, ...names.notice];
};

/** The static banner for a page: markup and reveal script. */
export interface StaticBanner {
	/** Wrapper, banner markup and reveal script, for the start of `<body>`. */
	html: string;
	/** The policy rendered. */
	policyId: string | undefined;
}

/**
 * Renders the stock banner for the first policy pack in the manifest that
 * shows a choice banner, in `language`, hidden, followed by the script that
 * shows it when the page's `/v1/consent/init` answers with the same policy.
 *
 * @param renderer - `@inth/react/static-banner`.
 * @param options - Language to render, and the consent storage key.
 * @returns The banner, or `undefined` when no pack shows a choice banner.
 * @internal
 */
export const renderStaticBannerHtml = function renderStaticBannerHtml(
	renderer: StaticBannerRenderer,
	manifest: ConsentManifest,
	options: { language: string; storageKey?: string }
): StaticBanner | undefined {
	for (const inputs of packInputs(manifest, options.language)) {
		let init: InitOutput;
		try {
			init = resolveManifestInit({ inputs, manifest });
		} catch {
			continue;
		}
		const markup = renderer.renderStaticBanner(init);
		const fingerprints = (
			init.policyResolution as
				| {
						fingerprints?: { policy?: string; presentation?: string };
						policyId?: string;
				  }
				| undefined
		)?.fingerprints;
		const policy = fingerprints?.policy;
		if (!(markup && policy && init.translations?.language)) {
			continue;
		}
		const script = buildStaticBannerScript(
			{
				branding: (init.branding as string | undefined) ?? null,
				copy: staticBannerCopyHash(init.translations.translations),
				language: init.translations.language,
				policy,
				presentation: fingerprints?.presentation ?? null,
			},
			storedNames(options.storageKey)
		);
		// The early-tap script inside records a tap; the attribute marks
		// the element the app's banner replaces.
		return {
			html: `<div ${STATIC_BANNER_ATTR} hidden>${markup}</div><script>${script}</script>`,
			policyId: (init.policyResolution as { policyId?: string } | undefined)
				?.policyId,
		};
	}
	return undefined;
};

/**
 * The sheets as hoisted React styles: `data-href` is what React 19 adopts
 * a `<style href precedence>` from, and what `@inth/react` looks up before
 * loading a deferred sheet.
 *
 * @param sheets - The stylesheets, in cascade order.
 * @internal
 */
export const renderStaticBannerSheets = function renderStaticBannerSheets(
	sheets: readonly StaticBannerSheet[]
): string {
	return sheets
		.map(
			({ css, id }) =>
				`<style data-href="${id}" data-precedence="inth">${css.replaceAll('</style', '<\\/style')}</style>`
		)
		.join('');
};

/**
 * Puts the sheets at the end of `<head>`, after the module preloads, and
 * the banner at the start of `<body>`, so it paints with the first frame
 * that shows it.
 *
 * @returns The page with both, or `html` when it has no `</head>`.
 * @internal
 */
export const injectStaticBanner = function injectStaticBanner(
	html: string,
	parts: { sheets: string; banner?: string }
): string {
	const headEnd = /<\/head\s*>/iu.exec(html);
	if (!headEnd) {
		return html;
	}
	let out = `${html.slice(0, headEnd.index)}${parts.sheets}${html.slice(headEnd.index)}`;
	const bodyStart = parts.banner ? /<body(?:\s[^>]*)?>/iu.exec(out) : null;
	if (bodyStart && parts.banner) {
		const end = bodyStart.index + bodyStart[0].length;
		out = `${out.slice(0, end)}${parts.banner}${out.slice(end)}`;
	}
	return out;
};
