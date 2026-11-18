// The file Expo loads when an app lists the package by name:
// `plugins: [['@inth/react-native', { ... }]]`. It is the plugin
// `@inth/react-native/expo-plugin` resolves to under `require`, so both names
// give the same config. Types stay on `@inth/react-native/expo-plugin`.
//
// The package is `"type": "module"`, so this file is an ES module, and two
// loaders read it. Expo SDK 55 `require()`s it natively, where the namespace's
// `default` is the CommonJS `module.exports` and the plugin is one level down.
// SDK 56 and later compile it to CommonJS with Babel's interop, where `default`
// is already the plugin. The fallback covers both.
import * as plugin from './dist/expo-plugin/index.cjs';

export default plugin.default.default ?? plugin.default;
