/**
 * Stands in for the `#@inth/sdk/build-options` Nitro virtual the module
 * registers at build time.
 */
import type { BuiltOptions } from '../runtime/server/build-options.model';

const built: BuiltOptions = {
	mode: { type: 'manifest' },
	routePrefix: '/api/inth',
};
export default built;
