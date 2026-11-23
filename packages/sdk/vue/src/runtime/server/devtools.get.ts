import { defineEventHandler, setResponseHeader } from 'h3';

import { DEVTOOLS_ICON_ROUTE } from '../devtools/devtools.model';
import { DEVTOOLS_ICON_SVG, renderDevToolsPage } from '../devtools/render-devtools-page';

/** Serves the Inth Nuxt DevTools tab page and its icon. Development only. */
export default defineEventHandler((event) => {
	setResponseHeader(event, 'Cache-Control', 'no-store');
	if (event.path.split('?')[0]?.endsWith(DEVTOOLS_ICON_ROUTE)) {
		setResponseHeader(event, 'Content-Type', 'image/svg+xml');
		return DEVTOOLS_ICON_SVG;
	}
	setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8');
	return renderDevToolsPage();
});
