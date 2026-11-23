/**
 * Ambient declaration for the build-time virtual modules the `inth()`
 * integration generates.
 *
 * `virtual:inth/options` is produced by the integration's Vite plugin and
 * carries the serialized configuration to the middleware, the injected API
 * routes and the client boot script. The server receives the manifest
 * snapshot; the browser options omit it and initialize through `/v1/consent/init`.
 */

declare module 'virtual:inth/options' {
	import type { InthResolvedOptions } from './inth-options.model';

	const options: InthResolvedOptions;
	export default options;
}
