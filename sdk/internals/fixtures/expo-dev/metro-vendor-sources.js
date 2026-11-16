const fs = require('node:fs');
const path = require('node:path');

/**
 * The bare fixture's vendor code, which `src/e2e/vendor-journey-app.tsx` imports.
 *
 * Both apps run the same `react-native-bare/src/vendors` files, so a vendor SDK
 * that misbehaves fails in both. Those files sit outside this project, and
 * Metro would resolve their package imports from the bare app's own
 * `node_modules`, which holds a different React Native. A second copy of React
 * Native in one bundle breaks at startup, so package imports from there
 * resolve as if this app's entry file made them. Relative imports stay put.
 *
 * A packed consumer (`scripts/prepare-packed-consumer.py`) carries a copy inside
 * the app instead.
 */
const packedVendorSources = path.join(__dirname, 'react-native-bare/src');
const vendorSources = fs.existsSync(packedVendorSources)
	? packedVendorSources
	: path.resolve(__dirname, '../react-native-bare/src');

/**
 * @param {import('expo/metro-config').MetroConfig} config Metro configuration.
 * @returns {import('expo/metro-config').MetroConfig} The same configuration,
 *   watching the vendor sources and resolving their packages from this app.
 */
const withVendorSources = (config) => ({
	...config,
	resolver: {
		...config.resolver,
		resolveRequest: (context, moduleName, platform) => {
			const fromVendorSources =
				context.originModulePath.startsWith(`${vendorSources}${path.sep}`) &&
				!moduleName.startsWith('.');

			return context.resolveRequest(
				fromVendorSources
					? {
							...context,
							originModulePath: path.join(__dirname, 'index.ts'),
						}
					: context,
				moduleName,
				platform
			);
		},
	},
	watchFolders: [...(config.watchFolders ?? []), vendorSources],
});

module.exports = { vendorSources, withVendorSources };
