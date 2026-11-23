import type { InjectionKey } from 'vue';

/**
 * The page's status region, which the banner renders as soon as a choice
 * is owed, before its container's chunk arrives, and keeps after the
 * prompt leaves (BNR-06).
 *
 * @internal
 */
export interface BannerPageRegion {
	/** Announce the outcome of a choice on the page. */
	announce: (message: string) => void;
	/**
	 * Give the region its visually hidden class. The container passes it:
	 * the class comes with the container's stylesheet, which the banner's
	 * own chunk, loaded on every page, does not carry.
	 */
	hide: (className: string | undefined) => void;
}

/** Provided by the banner to the container it loads. @internal */
export const bannerPageRegionKey: InjectionKey<BannerPageRegion> = Symbol(
	'inth:banner-page-region'
);
