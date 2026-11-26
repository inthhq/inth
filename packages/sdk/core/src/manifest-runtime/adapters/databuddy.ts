/**
 * The Databuddy adapter: runs Databuddy's session replay recorder,
 * `replay.js`, under Inth consent. The recorder is a script of its own
 * that ignores the tracker's `options.disabled`, so the adapter inserts it
 * once the tracker loads with consent and calls its own `stop()` when
 * consent is withdrawn or the last registration that wanted it goes.
 *
 * One recorder runs per page, and it belongs to every registration that
 * wants it: one whose tracker is loading or loaded with consent. When a
 * registration replaces another, the outgoing one lets go only after the
 * incoming one has started loading, so the outgoing one's dispose leaves
 * the recorder running even while the incoming tracker still downloads,
 * and the incoming one finds it running and does not load it twice.
 *
 * A manifest from the Inth server names it as
 * `adapter: { id: 'databuddy', options: { clientId, replay, version } }`;
 * the `databuddy()` helper in `@inth/integrations` builds its script with
 * the same function, and adds what only a site sets: its API URL and a
 * replay script URL of its own.
 */
import type {
	Script,
	ScriptCallbackInfo,
} from '../../libs/script-loader/types';
import type { ManifestAdapter } from '../adapter';

const cdnBaseUrl = 'https://cdn.databuddy.cc';

/** Databuddy's collection API, unless a site sets its own. */
export const DATABUDDY_DEFAULT_API_URL = 'https://basket.databuddy.cc';

type DatabuddyFile = 'databuddy' | 'replay';

/**
 * SRI hashes of the Databuddy releases whose files are known, by version.
 * Databuddy publishes no hashes, so a pinned release not listed here loads
 * without one.
 */
const releaseIntegrity: Readonly<
	Record<string, Readonly<Record<DatabuddyFile, string>>>
> = {
	'2026-10-30.1': {
		databuddy:
			'sha384-xXKfqQUu53gQi7i1OUzZ1t/rlpkyILPqMsDxO4MQH70gAX/yiDVUj1JogQaW0M2s',
		replay:
			'sha384-naub2msIlvDqEZRXGKjjR1CEOa9ZNszRcSgfitF8vO2qgKGlygxmOkxzH/puniCl',
	},
};

/**
 * The file name, URL and integrity of a Databuddy CDN file. Without
 * `version` it is Databuddy's unversioned file, which changes with each
 * release, so it loads without integrity.
 */
export const databuddyCdnFile = function databuddyCdnFile(
	file: DatabuddyFile,
	version: string | undefined
): { integrity: string | undefined; name: string; src: string } {
	const name = version === undefined ? `${file}.js` : `${file}.${version}.js`;
	return {
		integrity:
			version !== undefined && Object.hasOwn(releaseIntegrity, version)
				? releaseIntegrity[version]?.[file]
				: undefined,
		name,
		src: `${cdnBaseUrl}/${name}`,
	};
};

/** Session replay settings; each sets a `data-*` attribute on `replay.js`. */
export interface DatabuddyReplaySettings {
	maskText?: boolean;
	recordIframes?: boolean;
}

/** What the Inth server may set for the adapter. */
export interface DatabuddyAdapterOptions {
	clientId: string;
	replay: DatabuddyReplaySettings;
	/** A pinned release, for `replay.<version>.js`. */
	version?: string;
}

/** What the `databuddy()` helper adds for a site. */
export interface DatabuddyExtras {
	/** @default {@link DATABUDDY_DEFAULT_API_URL} */
	apiUrl?: string;
	/** A replay script URL of the site's own, which loads without integrity. */
	scriptUrl?: string;
}

interface ReplayWindow {
	/** Set by `replay.js` once it runs. */
	databuddyReplay?: { stop: () => void };
}

/** The page's recorder: the tag that loads it and who wants it running. */
const recorder: {
	element?: HTMLScriptElement;
	owners: Set<symbol>;
} = { owners: new Set() };

const booleanAttribute = (value: boolean | undefined): string | undefined =>
	value === undefined ? undefined : String(value);

/**
 * `base`, the script that loads `databuddy.js`, with the hooks that start
 * `replay.js` while measurement is granted and stop it on withdrawal or
 * disposal. A server render cannot start it from the HTML: the script has
 * no `serverStart`.
 */
export const databuddyReplayScript = function databuddyReplayScript(
	base: Script,
	{ clientId, replay, version }: DatabuddyAdapterOptions,
	{ apiUrl = DATABUDDY_DEFAULT_API_URL, scriptUrl }: DatabuddyExtras = {}
): Script {
	const file = databuddyCdnFile('replay', version);
	// A site's own URL loads without integrity, since Inth cannot know its bytes.
	const src = scriptUrl ?? file.src;
	const integrity = scriptUrl === undefined ? file.integrity : undefined;
	const owner = Symbol('databuddy replay');

	const start = (info: ScriptCallbackInfo): void => {
		recorder.owners.add(owner);
		if (
			(window as ReplayWindow).databuddyReplay ||
			recorder.element?.isConnected
		) {
			return;
		}
		const element = document.createElement('script');
		element.async = true;
		element.src = src;
		element.setAttribute('crossorigin', 'anonymous');
		if (integrity) {
			element.setAttribute('integrity', integrity);
		}
		element.setAttribute('data-api-url', apiUrl);
		element.setAttribute('data-client-id', clientId);
		const maskText = booleanAttribute(replay.maskText);
		if (maskText !== undefined) {
			element.setAttribute('data-mask-text', maskText);
		}
		const recordIframes = booleanAttribute(replay.recordIframes);
		if (recordIframes !== undefined) {
			element.setAttribute('data-record-iframes', recordIframes);
		}
		if (info.element?.nonce) {
			element.nonce = info.element.nonce;
		}
		recorder.element = element;
		document.head.appendChild(element);
	};
	// A removed `<script>` that finishes downloading does not start, because
	// `replay.js` checks that it is still in the document.
	const stop = (): void => {
		recorder.owners.delete(owner);
		if (recorder.owners.size > 0) {
			return;
		}
		recorder.element?.remove();
		recorder.element = undefined;
		// Core may dispose a loader created during server rendering.
		if (typeof window !== 'undefined') {
			(window as ReplayWindow).databuddyReplay?.stop();
		}
	};

	const { serverStart: _serverStart, ...rest } = base;
	return {
		...rest,
		onBeforeLoad(info) {
			base.onBeforeLoad?.(info);
			// Claim the recorder now, so an outgoing registration this one
			// replaces does not stop it while this tracker downloads.
			if (info.hasConsent) {
				recorder.owners.add(owner);
			}
		},
		onConsentChange(info) {
			base.onConsentChange?.(info);
			if (info.hasConsent) {
				start(info);
			} else if (!info.replacing) {
				// An outgoing replacement's denial is followed by its disposal,
				// which stops the recorder unless the incoming one claimed it.
				stop();
			}
		},
		onDispose(info) {
			base.onDispose?.(info);
			// An incoming registration with the same ID starts after this
			// disposal; let it claim the recorder before this one lets go.
			if (info.afterReplacement) {
				info.afterReplacement(() => {
					stop();
				});
			} else {
				stop();
			}
		},
		onError(info) {
			base.onError?.(info);
			// A tracker that failed to load does not want the recorder.
			stop();
		},
		onLoad(info) {
			base.onLoad?.(info);
			if (info.hasConsent) {
				start(info);
			}
		},
	};
};

/**
 * What a client ID may be. The `databuddy` dashboard options use the same
 * pattern, so the dashboard saves no ID this check refuses.
 */
export const DATABUDDY_CLIENT_ID_PATTERN = '^[A-Za-z0-9_-]{1,128}$';
/** What a pinned release may be, shared with the dashboard the same way. */
export const DATABUDDY_VERSION_PATTERN =
	'^[0-9]{4}-[0-9]{2}-[0-9]{2}[.][0-9]{1,6}$';
const CLIENT_ID = new RegExp(DATABUDDY_CLIENT_ID_PATTERN, 'u');
const VERSION = new RegExp(DATABUDDY_VERSION_PATTERN, 'u');
const OPTION_NAMES: ReadonlySet<string> = new Set([
	'clientId',
	'replay',
	'version',
]);
const REPLAY_NAMES: ReadonlySet<string> = new Set([
	'maskText',
	'recordIframes',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Why `options` are not {@link DatabuddyAdapterOptions}, or `undefined`.
 * It refuses any name it does not know, so no option can carry a URL.
 */
export const databuddyOptionsProblem = function databuddyOptionsProblem(
	options: Readonly<Record<string, unknown>>
): string | undefined {
	const extra = Object.keys(options).find((name) => !OPTION_NAMES.has(name));
	if (extra !== undefined) {
		return `it has the unknown option ${extra}`;
	}
	if (
		!(typeof options.clientId === 'string' && CLIENT_ID.test(options.clientId))
	) {
		return 'its clientId is not a client ID';
	}
	if (
		options.version !== undefined &&
		!(typeof options.version === 'string' && VERSION.test(options.version))
	) {
		return 'its version is not a release';
	}
	const { replay } = options;
	return isRecord(replay) &&
		Object.entries(replay).every(
			([name, value]) => REPLAY_NAMES.has(name) && typeof value === 'boolean'
		)
		? undefined
		: 'its replay is not maskText and recordIframes switches';
};

/** The Databuddy adapter, as `adapter: { id: 'databuddy' }` runs it. */
export const databuddyAdapter: ManifestAdapter<DatabuddyAdapterOptions> = {
	id: 'databuddy',
	problem: databuddyOptionsProblem,
	script: (base, options) => databuddyReplayScript(base, options),
};
