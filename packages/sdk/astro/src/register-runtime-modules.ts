import { watchRevocationReload } from '@inth/sdk/engine';
import { createIframeBlocker } from '@inth/sdk/modules/iframe-blocker';
import { createPersistence } from '@inth/sdk/modules/persistence';
import { createWindowDebug } from '@inth/sdk/modules/window-debug';
import { clearOnRevocationOnDemand } from '@inth/sdk/runtime/on-demand-factories';
import type { ConsentRuntimeModules } from '@inth/sdk/runtime/provider';

/**
 * Stands in for a module the engine module did not register.
 *
 * The integration's engine module registers the script loader, the network
 * blocker and the `consentSource` connection whenever the site can
 * configure them, so this only runs under `boot()` without the
 * integration, which then fails loudly instead of dropping the option. A
 * fallback `import()` of these modules here would keep a site's
 * statically imported script loader in a chunk of its own.
 *
 * @param option - The option that needs the module.
 * @throws {Error} Always.
 */
export const notRegistered = function notRegistered(option: string): never {
	throw new Error(
		`@inth/astro: \`${option}\` needs the module the integration's engine module registers.`
	);
};

/**
 * The runtime modules the page mounts. Data clearing loads on demand;
 * persistence and the iframe blocker load with the engine. The engine
 * module (`virtual:inth/engine`) registers the script loader, the network blocker and a `consentSource`
 * connection for a site that can configure them, and the IAB mount
 * through {@link registerIAB} for a site that sets `iab`.
 */
let pageRuntimeModules: ConsentRuntimeModules = {
	connectConsentSource: () => notRegistered('consentSource'),
	createClearOnRevocation: clearOnRevocationOnDemand,
	createIframeBlocker,
	createNetworkBlocker: ({ hold }) => {
		// Nothing will decide the held requests: fail them closed.
		hold?.block();
		return notRegistered('networkBlocker');
	},
	createPersistence,
	createScriptLoader: () => notRegistered('scripts'),
	createWindowDebug,
	watchRevocationReload,
};

/**
 * Mount these module factories.
 *
 * The integration's engine module imports the script loader statically
 * when the site configures `scripts` (or a `clientEntrypoint` that may add
 * some), and the network blocker when it configures rules, so those ship
 * with the engine instead of one round trip after it. A `clientEntrypoint`
 * that may add blocker rules gets the on-demand blocker. Call before
 * `boot()`.
 *
 * @param modules - The module factories to mount.
 * @internal
 */
export const registerRuntimeModules = function registerRuntimeModules(
	modules: Partial<ConsentRuntimeModules>
): void {
	pageRuntimeModules = { ...pageRuntimeModules, ...modules };
};

/**
 * The module factories the page mounts: the defaults with every
 * registered module over them.
 *
 * @internal
 */
export const registeredRuntimeModules =
	function registeredRuntimeModules(): ConsentRuntimeModules {
		return pageRuntimeModules;
	};
