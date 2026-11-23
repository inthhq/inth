'use client';

/**
 * `@inth/react/components/consent-banner`: the stock consent banner, a
 * Card, Banner or Drawer.
 *
 * @packageDocumentation
 */

// oxlint-disable-next-line oxc/no-barrel-file -- The public component entry.
export {
	ConsentBanner,
	type ConsentBannerButton,
	type ConsentBannerLayout,
	type ConsentBannerProps,
	preloadServerContainer,
} from './prompt';
export { useBannerCopy } from './use-banner-copy';
