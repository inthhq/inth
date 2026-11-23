/**
 * Nitro plugin: preloads the stock banner's own chunks at low priority on a
 * page that renders no banner. See `./banner-preload-priority.model`.
 */
import { defineNitroPlugin } from 'nitropack/runtime';

import bannerFiles from '#inth/banner-preload-files';

import { quietBannerHead } from './banner-preload-priority.model';

export default defineNitroPlugin((nitroApp) => {
	if (bannerFiles.length === 0) {
		return;
	}
	nitroApp.hooks.hook('render:html', (html, { event }) => {
		html.head = quietBannerHead(html.head, bannerFiles, event.context);
	});
});
