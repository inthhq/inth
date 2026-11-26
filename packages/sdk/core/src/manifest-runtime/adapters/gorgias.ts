/**
 * The Gorgias adapter: waits for Gorgias Chat to be ready and disables its
 * Segment analytics while measurement is denied.
 *
 * Before `init()` resolves, Gorgias's chat API is a Proxy that throws on
 * every read but `init`, so the adapter reads nothing else from it until
 * then. A manifest from the Inth server names it as
 * `adapter: { id: 'gorgias' }` with no options; the `gorgiasChat()` helper
 * in `@inth/integrations` builds its script with the same function.
 */
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

interface GorgiasChatApi {
	init: () => Promise<unknown>;
	disableSegment: () => void;
}

/** The Gorgias adapter takes no options: the manifest holds the app key. */
export type GorgiasAdapterOptions = Record<string, never>;

interface GorgiasLoad {
	element: HTMLScriptElement;
	measurement: boolean;
	api?: GorgiasChatApi;
	initializing: boolean;
	segmentDisabled: boolean;
	removeListener: () => void;
}

const chat = (): GorgiasChatApi | undefined =>
	(window as { GorgiasChat?: GorgiasChatApi }).GorgiasChat;

/**
 * `base`, the script that loads Gorgias's bundle loader, with the hooks
 * that wait for the chat (its `gorgias-widget-loaded` event, or `init()`),
 * then disable Segment while measurement is denied. Work a load started is
 * dropped once that load is revoked, errors, is disposed or is replaced, so
 * an old `init()` cannot act on a later load. It drops `base`'s server
 * start, as for every adapter.
 */
export const gorgiasScript = function gorgiasScript(base: Script): Script {
	const { serverStart: _serverStart, ...script } = base;
	let current: GorgiasLoad | undefined;

	const isCurrent = (load: GorgiasLoad): boolean =>
		current === load && load.element.isConnected;
	const disableSegment = (load: GorgiasLoad): void => {
		if (load.api && !load.segmentDisabled) {
			load.api.disableSegment();
			load.segmentDisabled = true;
		}
	};
	const cancel = (): void => {
		current?.removeListener();
		current = undefined;
	};
	const ready = (load: GorgiasLoad): void => {
		if (!isCurrent(load) || load.api) {
			return;
		}
		load.api = chat();
		if (!load.api) {
			return;
		}
		load.removeListener();
		if (!load.measurement) {
			disableSegment(load);
		}
	};
	const waitForInit = async (load: GorgiasLoad): Promise<void> => {
		if (!isCurrent(load) || load.api || load.initializing) {
			return;
		}
		const api = chat();
		if (!api) {
			return;
		}
		load.initializing = true;
		// The vendor's pre-init Proxy throws on reads of every method except
		// init. Do not inspect disableSegment until its promise resolves.
		try {
			await api.init();
		} catch (error) {
			if (isCurrent(load)) {
				cancel();
				console.error('gorgiasChat: chat initialization failed.', error);
			}
			return;
		}
		ready(load);
	};
	const update = (info: ScriptCallbackInfo): GorgiasLoad | undefined => {
		if (!info.hasConsent) {
			if (current) {
				disableSegment(current);
			}
			cancel();
			return;
		}
		if (!info.element) {
			return;
		}
		if (current?.element !== info.element) {
			cancel();
			const onReady = (): void => {
				if (current && current.element === info.element) {
					ready(current);
				}
			};
			const load: GorgiasLoad = {
				element: info.element,
				initializing: false,
				measurement: info.consents.measurement === true,
				removeListener: () =>
					window.removeEventListener('gorgias-widget-loaded', onReady),
				segmentDisabled: false,
			};
			current = load;
			window.addEventListener('gorgias-widget-loaded', onReady);
		}
		const load = current;
		if (load) {
			load.measurement = info.consents.measurement === true;
			if (isCurrent(load) && !load.measurement) {
				disableSegment(load);
			}
		}
		return load;
	};
	const updateAndWait = (info: ScriptCallbackInfo): void => {
		const load = update(info);
		if (load) {
			void waitForInit(load);
		}
	};

	return {
		...script,
		onBeforeLoad: update,
		onConsentChange: updateAndWait,
		onDispose: cancel,
		onError: cancel,
		onLoad: updateAndWait,
	};
};

/** Why `options` are not the empty options the adapter takes, or `undefined`. */
export const gorgiasOptionsProblem = function gorgiasOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const [extra] = Object.keys(options);
	return extra === undefined ? undefined : `it has the unknown option ${extra}`;
};

/** The Gorgias adapter, as a manifest's `adapter: { id: 'gorgias' }` runs it. */
export const gorgiasAdapter: ManifestAdapter<GorgiasAdapterOptions> = {
	id: 'gorgias',
	problem: gorgiasOptionsProblem,
	script: (base) => gorgiasScript(base),
};
