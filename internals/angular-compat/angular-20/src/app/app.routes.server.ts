import { RenderMode } from '@angular/ssr';
import type { ServerRoute } from '@angular/ssr';

// Every page carries the visitor's consent, so none is prerendered.
export const serverRoutes: ServerRoute[] = [
	{ path: '**', renderMode: RenderMode.Server },
];
