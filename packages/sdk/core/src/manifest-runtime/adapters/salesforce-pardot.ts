/**
 * The Salesforce Account Engagement (Pardot) adapter, for its consent
 * mode: `pdt.js` with the consent API. It grants tracking once per consent
 * cycle, after the SDK loads, and replays the saved tracker configuration
 * when a download that was disposed of runs after its replacement loaded,
 * since each run of `pdt.js` replaces the configured dispatcher.
 *
 * A manifest from the Inth server names it as
 * `adapter: { id: 'salesforce-pardot', options: {} }`; the manifest's own
 * steps configure the tracker, revoke consent and send the page view. The
 * `pardotTracking()` helper in `@inth/integrations` builds its script with
 * the same function. Classic mode needs no adapter.
 */
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

type PardotWindow = Window & {
	pdt?: ((...args: unknown[]) => void) & { cq?: IArguments[] };
};

/** What a manifest's `adapter.options` hold for Pardot: nothing. */
export type PardotAdapterOptions = Record<string, never>;

interface PardotSdkLifecycle {
	queue: IArguments[];
	queueConsumed: boolean;
	restoreConsent?: () => void;
}

const sdkLifecycles = new WeakMap<Document, PardotSdkLifecycle>();

/**
 * `base`, the script built from Pardot's consent manifest, made to grant
 * tracking once per consent cycle after `pdt.js` loads, and to configure
 * every run of `pdt.js` after the first again.
 */
export const pardotConsentScript = function pardotConsentScript(
	base: Script
): Script {
	const script = base;
	// The consent queue waits for consent in the browser, so a server render
	// writes no inline start.
	const { serverStart: _serverStart, ...rest } = base;
	let hasConsent = false;
	let loaded = false;
	let started = false;
	let sdkLifecycle: PardotSdkLifecycle | undefined;
	const pdt = () => (window as PardotWindow).pdt;
	const restoreConsent = () => {
		if (loaded && hasConsent && started) {
			pdt()?.('setOptIn', true);
		}
	};
	const grant = (info: ScriptCallbackInfo): void => {
		if (loaded && hasConsent && info.element?.isConnected && !started) {
			started = true;
			script.onLoad?.(info);
		}
	};
	return {
		...rest,
		onBeforeLoad(info) {
			({ hasConsent } = info);
			if (hasConsent) {
				script.onBeforeLoad?.(info);
				sdkLifecycle = sdkLifecycles.get(document);
				if (!sdkLifecycle) {
					sdkLifecycle = { queue: [], queueConsumed: false };
					sdkLifecycles.set(document, sdkLifecycle);
				}
				sdkLifecycle.queue = pdt()?.cq?.slice() ?? [];
				sdkLifecycle.queueConsumed = false;
				sdkLifecycle.restoreConsent = restoreConsent;
				const lifecycle = sdkLifecycle;
				// A disposed download can still execute after a replacement loads.
				// Every execution after the first needs its own tracker configuration.
				info.element?.addEventListener(
					'load',
					() => {
						if (lifecycle.queueConsumed) {
							for (const args of lifecycle.queue) {
								pdt()?.(...Array.from(args));
							}
						}
						lifecycle.queueConsumed = true;
						lifecycle.restoreConsent?.();
					},
					{ once: true }
				);
			}
		},
		onConsentChange(info) {
			({ hasConsent } = info);
			if (!hasConsent) {
				started = false;
			}
			script.onConsentChange?.(info);
			grant(info);
		},
		onDispose() {
			if (sdkLifecycle?.restoreConsent === restoreConsent) {
				sdkLifecycle.restoreConsent = undefined;
			}
		},
		onLoad(info) {
			loaded = true;
			if (info.hasConsent) {
				grant(info);
			}
		},
	};
};

/**
 * Why `options` are not {@link PardotAdapterOptions}, or `undefined`. The
 * adapter takes none: the account, campaign and tracker host are in the
 * manifest's steps.
 */
export const pardotOptionsProblem = function pardotOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const [extra] = Object.keys(options);
	return extra === undefined ? undefined : `it has the unknown option ${extra}`;
};

/** The Pardot adapter, as a manifest's `adapter: { id: 'salesforce-pardot' }` runs it. */
export const pardotAdapter: ManifestAdapter<PardotAdapterOptions> = {
	id: 'salesforce-pardot',
	problem: pardotOptionsProblem,
	script: (base) => pardotConsentScript(base),
};
