/**
 * The Zendesk adapter: points Zendesk Messaging's loader at the element
 * Inth inserted, and keeps its cookie range in step with consent.
 *
 * A manifest from the Inth server names it as `adapter: { id: 'zendesk' }`
 * with no options; the `zendeskWidget()` helper in `@inth/integrations`
 * builds its script with the same function, and adds the registrations of
 * several loaders that share one script.
 */
import { has } from '../../libs/has';
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

interface ZendeskWidgetApi {
	(...args: unknown[]): void;
	s?: HTMLScriptElement;
}

/** What only a site's own code passes the adapter. */
export interface ZendeskExtras {
	/**
	 * Every registration's state for `info`, when several registrations
	 * share this script. The widget runs while any of them allows it.
	 */
	registrations?: (info: ScriptCallbackInfo) => readonly ScriptCallbackInfo[];
}

/** The Zendesk adapter takes no options: the manifest holds the key. */
export type ZendeskAdapterOptions = Record<string, never>;

/**
 * `base`, the script that defines `zE` and loads Zendesk's snippet, with
 * the hooks that point `zE.s` at the loader's element on every grant, also
 * when `zE` is already a function (an earlier grant's stub, or the loaded
 * API on a remount), and set the cookie range: `all` while measurement is
 * also allowed, `functional` without it, `none` once nothing allows the
 * widget. It drops `base`'s server start, as for every adapter.
 */
export const zendeskScript = function zendeskScript(
	base: Script,
	extras: ZendeskExtras = {}
): Script {
	const { serverStart: _serverStart, ...script } = base;
	const { category } = base;
	let installed = false;

	const grantedRegistrations = (info: ScriptCallbackInfo) =>
		(extras.registrations?.(info) ?? [info]).filter(
			// Configuration removal reports hasConsent: false even while granted.
			(state) =>
				state.vendor?.granted !== false && has(category, state.consents)
		);

	const zE = (): ZendeskWidgetApi | undefined =>
		(window as { zE?: ZendeskWidgetApi }).zE;

	const updateCookieRange = (info: ScriptCallbackInfo): void => {
		if (!installed || typeof window === 'undefined') {
			return;
		}
		const granted = grantedRegistrations(info);
		let range: 'all' | 'functional' | 'none' = 'none';
		if (granted.length > 0) {
			range = granted.every((state) => state.consents.measurement)
				? 'all'
				: 'functional';
		}
		zE()?.('messenger:set', 'cookies', range);
	};

	return {
		...script,
		onBeforeLoad(info) {
			if (
				grantedRegistrations(info).length === 0 ||
				!info.element ||
				typeof window === 'undefined'
			) {
				return;
			}
			base.onBeforeLoad?.(info);
			const api = zE();
			if (typeof api !== 'function') {
				return;
			}

			// The official loader reads zE.s when no ze-snippet element exists.
			// Preserve core's DOM ID so load tracking and removal keep working.
			api.s = info.element;
			installed = true;
			updateCookieRange(info);
		},
		onConsentChange: updateCookieRange,
		onDispose() {
			installed = false;
		},
	};
};

/** Why `options` are not the empty options the adapter takes, or `undefined`. */
export const zendeskOptionsProblem = function zendeskOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const [extra] = Object.keys(options);
	return extra === undefined ? undefined : `it has the unknown option ${extra}`;
};

/** The Zendesk adapter, as a manifest's `adapter: { id: 'zendesk' }` runs it. */
export const zendeskAdapter: ManifestAdapter<ZendeskAdapterOptions> = {
	id: 'zendesk',
	problem: zendeskOptionsProblem,
	script: (base) => zendeskScript(base),
};
