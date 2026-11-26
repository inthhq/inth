/**
 * `inth.manifests.js`, the manifest runtime as a file of its own.
 *
 * The script-tag engines run the integrations the Inth server sends on
 * `scriptRegistry.load` with it (`remoteScripts`), so a site without any
 * keeps it out of its bundle. The init script (`inth.js`) loads it as soon
 * as a list with entries arrives, so it is there when the engine needs it.
 *
 * @packageDocumentation
 * @internal
 */

import type { RemoteManifestRuntime } from '@inth/sdk-core/modules/script-loader';

import type { PartFile } from './part-file';

/** Global `inth.manifests.js` publishes its {@link ManifestsFile} on. */
export const MANIFESTS_KEY = '__inthManifests';

/**
 * Global `inth.manifests3.js` publishes its {@link ManifestsFile} on: the
 * same runtime with level 3, which the init script and the engine load in
 * place of `inth.manifests.js` when a manifest requires level 3.
 */
export const LEVEL_THREE_KEY = '__inthManifests3';

/** What `inth.manifests.js` and `inth.manifests3.js` publish. @internal */
export interface ManifestsFile extends PartFile, RemoteManifestRuntime {}
