/**
 * Entry point for `@inth/react-native/expo-plugin`, which the package root's
 * `app.plugin.js` also loads, so `app.json` can name either.
 *
 * Add it to `app.json` with an explicit Android artifact repository: the native core gets its
 * bootstrap config, the launch hook, the Android permission, and the iOS privacy
 * keys, and the same values reach JavaScript through `extra.inth`.
 *
 * ```json
 * {
 *   "plugins": [
 *     [
 *       "@inth/react-native",
 *       {
 *         "backendURL": "https://your-project.inth.app",
 *         "androidMavenRepository": { "url": "https://maven.example.com/inth" }
 *       }
 *     ]
 *   ]
 * }
 * ```
 *
 * This module pulls in `node:fs` and the app's `expo/config-plugins`. It is a build-time
 * tool and nothing in the package's React Native entry point imports it, so it
 * never reaches a Metro bundle.
 *
 * Expo resolves a plugin with `require`, and `require()` of an ES module is
 * unflagged only on Node 20.19+, 22.12+, and 24+. This entry therefore ships
 * twice: the ES module at `dist/expo-plugin/index.js` under the `import`
 * condition, and one bundled CommonJS file at `dist/expo-plugin/index.cjs` under
 * `require`, which is the file Expo loads. Both carry the same exports.
 */
import { createRunOncePlugin } from './config-plugins';
import { PLUGIN_NAME } from './constants';
import { withInth } from './with-inth';

/** The plugin to name in an `app.json` `plugins` array. */
const withInthOnce = createRunOncePlugin(withInth, PLUGIN_NAME);

export default withInthOnce;

export { withInth } from './with-inth';
export { applyParamsOnConfig, type InthExtraConfig } from './with-inth';
export { InthPluginError } from './errors';
export type {
	InthGppMspaMode,
	InthGppPluginProps,
	InthIabPluginProps,
	InthPluginProps,
	InthTrackingMarkdownLocalization,
	ResolvedInthGppParams,
	ResolvedInthIabParams,
	ResolvedInthParams,
} from './params';
export {
	INTH_PROJECT_HOST_SUFFIXES,
	normalizeProjectURL,
	ProjectURLError,
} from './project-url';
export type { ProjectURLOptions, ProjectURLReason } from './project-url';
export type { WorkflowContext } from './workflow';

export type { InthAndroidMavenRepository } from './maven';
export type {
	InthThemeColorName,
	InthThemeColors,
	InthThemePluginProps,
} from './theme';
