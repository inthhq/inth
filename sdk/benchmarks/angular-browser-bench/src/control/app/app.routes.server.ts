import { RenderMode } from '@angular/ssr';
import type { ServerRoute } from '@angular/ssr';

// Rendered per request like the gate page, so both pay the same server work.
export const serverRoutes: ServerRoute[] = [
	{ path: '**', renderMode: RenderMode.Server },
];
