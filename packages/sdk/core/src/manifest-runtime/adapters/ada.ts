/**
 * The Ada adapter: starts Ada's Messaging Web SDK, an ES module, once its
 * consent is granted, and stops it when consent goes. Ada allows one
 * interface per page, so every registration shares one interface and one
 * chain of start and stop calls.
 *
 * A manifest from the Inth server names it as `adapter: { id: 'ada' }` with
 * {@link AdaAdapterOptions}; the `ada()` helper in `@inth/integrations`
 * builds its script with the same function.
 */
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

/** The module the adapter imports, on Ada's own host. */
export const ADA_MESSAGING_SDK_URL =
	'https://messaging-assets.ada.support/sdk.js';

/** The settings Ada's `start()` takes. */
export interface AdaAdapterOptions {
	/** Public AI Agent handle supplied by Ada. */
	handle: string;
	/** Regional cluster supplied by Ada, such as `eu`. */
	cluster?: string;
	/** Ada base-domain segment, when Ada supplies an override. */
	domain?: string;
}

interface AdaMessagingInterface {
	start: (settings: AdaAdapterOptions) => Promise<void>;
	stop: () => Promise<void>;
}

interface AdaMessagingModule {
	createAdaEmbedInterface: () => AdaMessagingInterface;
}

interface StartAttempt {
	cancelled: boolean;
	started: boolean;
	stop?: Promise<void>;
}

// Ada permits one interface per page, including fresh helper objects.
let instance: AdaMessagingInterface | undefined;
let attempt: StartAttempt | undefined;
let operations = Promise.resolve();
// Settings of the granted configuration; undefined while Messaging is off.
let active: AdaAdapterOptions | undefined;
// Invariant: every symbol here belongs to the configuration in `active`.
const registrations = new Set<symbol>();

const stop = (current: StartAttempt): Promise<void> => {
	if (!current.started || !instance) {
		return Promise.resolve();
	}
	if (!current.stop) {
		const client = instance;
		current.stop = (async () => {
			try {
				await client.stop();
			} catch (error) {
				console.error('ada: failed to stop Messaging.', error);
			}
		})();
	}
	return current.stop;
};

const sameSettings = (
	left: AdaAdapterOptions,
	right: AdaAdapterOptions
): boolean =>
	left.handle === right.handle &&
	left.cluster === right.cluster &&
	left.domain === right.domain;

const deactivate = (): void => {
	active = undefined;
	if (!attempt || attempt.cancelled) {
		return;
	}
	attempt.cancelled = true;
	// Stop immediately: awaiting start first would leave a pending SDK active.
	const pending = [operations, stop(attempt)];
	operations = (async () => {
		await Promise.all(pending);
	})();
};

const startMessaging = (settings: AdaAdapterOptions): void => {
	if (active) {
		return;
	}
	active = settings;
	const current: StartAttempt = { cancelled: false, started: false };
	attempt = current;
	const pending = operations;
	operations = (async () => {
		try {
			await pending;
			if (current.cancelled) {
				return;
			}
			// Ada's entry performs network/storage work during evaluation.
			// Keep this import inside the granted-consent lifecycle.
			const sdk: AdaMessagingModule = await import(
				/* webpackIgnore: true */
				/* @vite-ignore */
				ADA_MESSAGING_SDK_URL
			);
			if (current.cancelled) {
				return;
			}
			if (typeof sdk.createAdaEmbedInterface !== 'function') {
				throw new Error(
					'Ada Messaging did not export createAdaEmbedInterface.'
				);
			}
			// A second interface rejects with start_owner_conflict. Revocation
			// already ran stop() before this start, and Ada documents that
			// stop() then start() creates a new client with the new settings.
			instance ??= sdk.createAdaEmbedInterface();
			current.started = true;
			await instance.start(settings);
		} catch (error) {
			if (!current.cancelled) {
				active = undefined;
				registrations.clear();
				console.error('ada: failed to start Messaging.', error);
			}
		}
	})();
};

/**
 * `base`, a callback-only script, with the hooks that start Ada Messaging
 * with `settings` while its consent is granted and stop it when the last
 * granted registration revokes or disposes. A registration whose settings
 * differ from the running ones logs a warning and is ignored until the page
 * reloads.
 */
export const adaScript = function adaScript(
	base: Script,
	settings: AdaAdapterOptions
): Script {
	const registration = Symbol('ada');
	let ignored = false;
	const dispose = (info: ScriptCallbackInfo): void => {
		if (ignored) {
			return;
		}
		registrations.delete(info.registration ?? registration);
		if (registrations.size === 0) {
			deactivate();
		}
	};

	const update = (info: ScriptCallbackInfo): void => {
		if (!info.hasConsent) {
			dispose(info);
			return;
		}
		if (ignored || typeof window === 'undefined') {
			return;
		}
		if (active && !sameSettings(active, settings)) {
			ignored = true;
			registrations.delete(info.registration ?? registration);
			console.warn(
				'ada: Ada supports one configuration per page. These settings are ignored until the page reloads.'
			);
			return;
		}
		registrations.add(info.registration ?? registration);
		startMessaging(settings);
	};

	return {
		...base,
		onBeforeLoad: update,
		onConsentChange: update,
		onDispose: dispose,
		onLoad: update,
	};
};

/** A handle, cluster or domain segment: no dot, slash or other URL part. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/u;

const OPTION_NAMES: ReadonlySet<string> = new Set([
	'cluster',
	'domain',
	'handle',
]);

/**
 * Why `options` are not {@link AdaAdapterOptions} the Inth server may send,
 * or `undefined`. Each is one host label Ada builds its own URLs from.
 */
export const adaOptionsProblem = function adaOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const extra = Object.keys(options).find((name) => !OPTION_NAMES.has(name));
	if (extra !== undefined) {
		return `it has the unknown option ${extra}`;
	}
	const wrong = ['handle', 'cluster', 'domain'].find((name) => {
		const value = options[name];
		if (value === undefined && name !== 'handle') {
			return false;
		}
		return !(typeof value === 'string' && SEGMENT.test(value));
	});
	return wrong === undefined
		? undefined
		: `its ${wrong} is not a single host label`;
};

/** The Ada adapter, as a manifest's `adapter: { id: 'ada' }` runs it. */
export const adaAdapter: ManifestAdapter<AdaAdapterOptions> = {
	id: 'ada',
	problem: adaOptionsProblem,
	script: adaScript,
};
