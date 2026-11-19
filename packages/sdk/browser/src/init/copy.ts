/**
 * The init script's copy: the `/v1/consent/init` answer's translations, with no
 * bundled fallback.
 *
 * The engine's banner fills keys the answer lacks with bundled English
 * (`../ui/copy.ts`). The init script carries no copy of its own, so it
 * renders its banner only when the answer has every string the banner can
 * show ({@link hasBannerCopy}), and leaves any other banner to the engine.
 * `rslib.config.ts` swaps this module in for `../ui/copy.ts` in `inth.js`.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot, Translations } from '@inth/sdk-core';
import type { CompleteTranslations } from '@inth/sdk-translations';
import { getTextDirection } from '@inth/sdk-ui/utils';

import type { SurfaceCopy } from '../ui/copy';

/** Every string the stock banner reads, by section. */
const BANNER_COPY = {
	common: [
		'acceptAll',
		'acknowledge',
		'customize',
		'rejectAll',
		'save',
		'securedBy',
	],
	cookieBanner: ['description', 'noticeDescription', 'noticeTitle', 'title'],
	legalLinks: ['cookiePolicy', 'privacyPolicy', 'termsOfService'],
} as const;

/**
 * Whether the snapshot's translations hold every string the banner reads.
 *
 * @returns `true` when the banner needs no bundled copy.
 */
export const hasBannerCopy = function hasBannerCopy(
	snapshot: ConsentSnapshot
): boolean {
	const bundle = snapshot.translations?.translations as
		| Record<string, Record<string, unknown> | undefined>
		| undefined;
	return Object.entries(BANNER_COPY).every(([section, keys]) =>
		keys.every((key) => typeof bundle?.[section]?.[key] === 'string')
	);
};

/**
 * The copy a surface renders: the snapshot's translations as they are.
 * Call only when {@link hasBannerCopy} holds, so every string core's
 * `consent-copy` order would reach is in the bundle and no English is
 * needed behind it.
 */
export const resolveCopy = function resolveCopy(
	snapshot: ConsentSnapshot
): SurfaceCopy {
	const language = snapshot.translations?.language;
	const t = snapshot.translations?.translations as CompleteTranslations;
	const { rights } = t as Partial<Translations>;
	const notice = snapshot.policyRule.prompt === 'notice';
	return {
		actions: {
			accept: t.common.acceptAll,
			customize: t.common.customize,
			dismiss: t.common.acknowledge,
			reject: t.common.rejectAll,
			save: t.common.save,
		},
		controls: {
			'opt-out': rights?.optOut ?? '',
			preferences: rights?.preferences ?? '',
		},
		dir: getTextDirection(language),
		language,
		prompt: notice
			? {
					description: t.cookieBanner.noticeDescription,
					title: t.cookieBanner.noticeTitle,
				}
			: {
					description: t.cookieBanner.description,
					title: t.cookieBanner.title,
				},
		t,
	};
};
