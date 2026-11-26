/**
 * The Adobe Target adapter, for the Adobe Experience Platform Web SDK
 * (Alloy): installs Alloy's queue stub before alloy.min.js loads, calls
 * `configure` with consent pending once Target is first allowed, then sends
 * Adobe 1.0 `setConsent` `in` or `out` as consent changes. Consent requests
 * go one at a time; a change while one is in flight sends the latest state
 * after it settles.
 *
 * A manifest from the Inth server names it as
 * `adapter: { id: 'adobe-target' }` with {@link AdobeTargetAdapterOptions}.
 * The `adobeTarget()` helper in `@inth/integrations` builds its Web SDK
 * script with {@link adobeTargetWebSdkScript} and adds what only a site's
 * own code passes: other registrations of the same script. Its at.js mode
 * does not use the adapter.
 */
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

/** What a manifest's `adapter.options` holds for Adobe Target's Web SDK. */
export interface AdobeTargetAdapterOptions {
	/** Public datastream ID from Adobe Data Collection. */
	datastreamId: string;
	/** Adobe organization ID including the @AdobeOrg suffix. */
	orgId: string;
}

/** What only a site's own code passes the adapter. */
export interface AdobeTargetExtras {
	/**
	 * Every registration's state for `info`, when several registrations
	 * share this script. The stub goes in once any of them allows Target.
	 */
	registrations?: (info: ScriptCallbackInfo) => readonly ScriptCallbackInfo[];
}

type AlloyQueueEntry = [
	resolve: (value: unknown) => void,
	reject: (reason?: unknown) => void,
	args: [command: string, options?: Record<string, unknown>],
];

type AlloyFunction = ((
	command: string,
	options?: Record<string, unknown>
) => Promise<unknown>) & { q: AlloyQueueEntry[] };

type AlloyWindow = Window & {
	__alloyNS?: string[];
	alloy?: AlloyFunction;
};

const installAlloyStub = function installAlloyStub(): AlloyFunction {
	const win = window as AlloyWindow;
	if (win.alloy) {
		return win.alloy;
	}
	win.__alloyNS ??= [];
	if (!win.__alloyNS.includes('alloy')) {
		win.__alloyNS.push('alloy');
	}
	// Adobe replaces q.push with its executor, while the public function stays.
	// The queue entries must keep resolve, reject and command arguments.
	const alloy: AlloyFunction = Object.assign(
		(...args: [command: string, options?: Record<string, unknown>]) =>
			new Promise<unknown>((resolve, reject) => {
				window.setTimeout(() => {
					alloy.q.push([resolve, reject, args]);
				}, 0);
			}),
		{ q: [] as AlloyQueueEntry[] }
	);
	win.alloy = alloy;
	return alloy;
};

const reportAlloyError = (command: string, error: unknown): void => {
	console.error(`adobeTarget: Web SDK ${command} failed`, error);
};

/**
 * `base`, the script that loads alloy.min.js, with the hooks that start the
 * Web SDK with consent pending and send Adobe 1.0 consent.
 */
export const adobeTargetWebSdkScript = function adobeTargetWebSdkScript(
	base: Script,
	options: AdobeTargetAdapterOptions,
	{ registrations = (info) => [info] }: AdobeTargetExtras = {}
): Script {
	let loaded = false;
	let alloy: AlloyFunction | undefined;
	let configureAttempted = false;
	let configured = false;
	let currentConsent = false;
	let acknowledgedConsent: boolean | undefined;
	let sendingConsent = false;
	const sendConsent = async (): Promise<void> => {
		if (
			!configured ||
			!alloy ||
			sendingConsent ||
			acknowledgedConsent === currentConsent
		) {
			return;
		}
		const requestedConsent = currentConsent;
		sendingConsent = true;
		try {
			await alloy('setConsent', {
				consent: [
					{
						standard: 'Adobe',
						value: { general: requestedConsent ? 'in' : 'out' },
						version: '1.0',
					},
				],
			});
			acknowledgedConsent = requestedConsent;
		} catch (error) {
			// A rejected request can still change Adobe's persisted consent.
			acknowledgedConsent = undefined;
			reportAlloyError('setConsent', error);
		}
		sendingConsent = false;
		if (requestedConsent !== currentConsent) {
			void sendConsent();
		}
	};
	const configure = async (runtime: AlloyFunction): Promise<void> => {
		// Alloy retains a rejected configure promise; recovery needs a reload.
		configureAttempted = true;
		try {
			await runtime('configure', {
				datastreamId: options.datastreamId,
				defaultConsent: 'pending',
				orgId: options.orgId,
			});
		} catch (error) {
			reportAlloyError('configure', error);
			return;
		}
		configured = true;
		void sendConsent();
	};
	const signal = (granted: boolean): void => {
		currentConsent = granted;
		if (!loaded || !alloy) {
			return;
		}
		if (configured) {
			void sendConsent();
		} else if (!configureAttempted && granted) {
			void configure(alloy);
		}
	};
	// The hooks run in the browser, so a server render leaves the tag to it.
	const { serverStart: _serverStart, ...rest } = base;
	return {
		...rest,
		onBeforeLoad(info) {
			if (registrations(info).some((state) => state.hasConsent)) {
				alloy = installAlloyStub();
			}
		},
		onConsentChange(info) {
			signal(info.hasConsent);
		},
		onDispose() {
			signal(false);
		},
		onLoad(info) {
			loaded = true;
			signal(info.hasConsent);
		},
	};
};

const OPTION_NAMES: ReadonlySet<string> = new Set(['datastreamId', 'orgId']);

const DATASTREAM_ID = /^[0-9A-Za-z_-]{1,64}$/u;
const ORG_ID = /^[0-9A-Za-z]{1,64}@AdobeOrg$/u;

/**
 * Why `options` are not {@link AdobeTargetAdapterOptions} the Inth server
 * may send, or `undefined`. It refuses any name it does not know.
 */
export const adobeTargetOptionsProblem = function adobeTargetOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const extra = Object.keys(options).find((name) => !OPTION_NAMES.has(name));
	if (extra !== undefined) {
		return `it has the unknown option ${extra}`;
	}
	if (
		typeof options.datastreamId !== 'string' ||
		!DATASTREAM_ID.test(options.datastreamId)
	) {
		return 'its datastreamId is not a datastream ID';
	}
	return typeof options.orgId === 'string' && ORG_ID.test(options.orgId)
		? undefined
		: 'its orgId is not an Adobe organization ID';
};

/** The Adobe Target adapter, as `adapter: { id: 'adobe-target' }` runs it. */
export const adobeTargetAdapter: ManifestAdapter<AdobeTargetAdapterOptions> = {
	id: 'adobe-target',
	problem: adobeTargetOptionsProblem,
	script: (base, options) => adobeTargetWebSdkScript(base, options),
};
