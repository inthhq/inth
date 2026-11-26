/**
 * The Lucky Orange adapter: sets Lucky Orange's privacy consent from Inth
 * consent. Lucky Orange hands its API to a ready callback queued on `LOQ`,
 * and its privacy module answers only once `$internal.ready('privacy')`
 * resolves, so the consent to apply is the one current at that moment, not
 * the one when the callback was queued.
 *
 * A manifest from the Inth server names it as
 * `adapter: { id: 'lucky-orange', options: {} }`; the `luckyOrange()` helper
 * in `@inth/integrations` builds its script with the same function.
 */
import type { Script } from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

/** Privacy API provided to Lucky Orange's ready callback. */
export interface LuckyOrangeApi {
	$internal: { ready: (module: string) => Promise<unknown> };
	privacy: {
		setConsentStatus: (consented: boolean) => void;
		getConsentStatus?: () => boolean;
	};
}

/** Lucky Orange's queue accepts ready callbacks before and after installation. */
export interface LuckyOrangeQueue {
	push: (entry: ['ready', (api: LuckyOrangeApi) => void]) => unknown;
}

interface LuckyOrangeWindow {
	LOQ?: LuckyOrangeQueue;
}

/** The Lucky Orange adapter takes no options. */
export type LuckyOrangeAdapterOptions = Record<string, never>;

/**
 * `base`, the script that loads Lucky Orange, with the hooks that queue a
 * ready callback on the first grant and keep its privacy consent current.
 * Its `onBeforeLoad` queues that callback, so a server render cannot start
 * the file from the HTML: the script has no `serverStart`.
 */
export const luckyOrangeScript = function luckyOrangeScript(
	base: Script
): Script {
	let hasConsent = false;
	let api: LuckyOrangeApi | undefined;
	let subscribed = false;
	let disposed = false;
	let appliedConsent: boolean | undefined;
	const applyConsent = (): void => {
		if (!api || appliedConsent === hasConsent) {
			return;
		}
		api.privacy.setConsentStatus(hasConsent);
		appliedConsent = hasConsent;
	};
	const ready = async (loaded: LuckyOrangeApi): Promise<void> => {
		try {
			await loaded.$internal.ready('privacy');
			if (disposed) {
				return;
			}
			api = loaded;
			applyConsent();
		} catch (error) {
			console.error('luckyOrange: privacy initialization failed.', error);
		}
	};
	const { serverStart: _serverStart, ...rest } = base;
	return {
		...rest,
		onBeforeLoad({ hasConsent: consent }) {
			hasConsent = consent;
			if (!hasConsent || subscribed) {
				return;
			}
			subscribed = true;
			const page = window as LuckyOrangeWindow;
			const queue: ['ready', (loaded: LuckyOrangeApi) => void][] = [];
			page.LOQ ??= queue;
			page.LOQ.push([
				'ready',
				(loaded) => {
					void ready(loaded);
				},
			]);
		},
		onConsentChange({ hasConsent: consent }) {
			hasConsent = consent;
			applyConsent();
		},
		onDispose() {
			disposed = true;
			hasConsent = false;
			applyConsent();
		},
	};
};

/**
 * Why `options` are not {@link LuckyOrangeAdapterOptions}, or `undefined`.
 * The adapter takes none, so any name is unknown.
 */
export const luckyOrangeOptionsProblem = function luckyOrangeOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const [extra] = Object.keys(options);
	return extra === undefined ? undefined : `it has the unknown option ${extra}`;
};

/** The Lucky Orange adapter, as `adapter: { id: 'lucky-orange' }` runs it. */
export const luckyOrangeAdapter: ManifestAdapter<LuckyOrangeAdapterOptions> = {
	id: 'lucky-orange',
	problem: luckyOrangeOptionsProblem,
	script: (base) => luckyOrangeScript(base),
};
