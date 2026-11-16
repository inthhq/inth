/**
 * The Nuxt plugin's consent engine: the runtime the app renders once it
 * has loaded. The plugin loads it at once for a visitor it cannot defer,
 * and otherwise when `deferred/shell.ts` asks for it, with the stock
 * banner's chunk in parallel.
 *
 * @packageDocumentation
 * @internal
 */
import type {
	HydrationRecords,
	IABUnavailableError,
	KernelConfig,
} from '@c15t/core';
import type { ConsentMode } from '@c15t/core/modes';
import { readStoredRecordsFromCookieHeader } from '@c15t/core/modules/persistence';
import { clientMode } from '@c15t/core/runtime/client-mode';

import { withClientData } from '../client-data';
import type { ConsentConfig } from '../config';
import { createVueConsentKernelContext } from '../kernel';
import type { RuntimeConsentConfig, VueConsentKernelContext } from '../kernel';
import type { DeferredCommitted } from './commit';

/** What the plugin read before it loaded the engine. @internal */
export interface NuxtEngineInput {
	config: RuntimeConsentConfig;
	/** Consent headers the server read from the request. */
	headers: Record<string, string>;
	/** The mode from `nuxt.config.ts`. */
	mode: ConsentMode;
	routePrefix: string | undefined;
	/** The state the server resolved, from the payload. */
	prefetchState: KernelConfig | undefined;
	/** The records the server read, from the payload. */
	initialRecords: HydrationRecords | undefined;
	/** Whether the browser reads stored records (no `consentSource`, not shared HTML). */
	readsRecords: boolean;
	onIABUnavailable: (error: IABUnavailableError) => void;
	/** A choice the deferred context recorded before the engine loaded. */
	committed?: DeferredCommitted;
}

type Permissions = DeferredCommitted['permissions'];

const samePermissions = (left: Permissions, right: Permissions): boolean =>
	Object.keys({ ...left, ...right }).every(
		(category) =>
			left[category as keyof Permissions] ===
			right[category as keyof Permissions]
	);

/**
 * The config after a commit. The app heard the commit's
 * `onPermissionsChanged`; a change reaches it again only when it differs
 * from what it last heard, with that as its `previous`.
 */
const committedConfig = function committedConfig(
	config: RuntimeConsentConfig,
	committed: DeferredCommitted
): RuntimeConsentConfig {
	const onPermissionsChanged = config.callbacks?.onPermissionsChanged;
	if (!onPermissionsChanged) {
		return config;
	}
	let heard = committed.permissions;
	return {
		...config,
		callbacks: {
			...config.callbacks,
			onPermissionsChanged: (event) => {
				const next = event.snapshot.effectivePermissions;
				if (samePermissions(next, heard)) {
					return;
				}
				const previous = heard;
				heard = next;
				onPermissionsChanged({ ...event, previous });
			},
		},
	};
};

/**
 * Builds the app's consent runtime in the browser, starting from the
 * server's state and, after a deferred commit, from the committed records.
 *
 * @param input - What the plugin read.
 * @returns The runtime context.
 * @throws {IABUnavailableError} When the state needs IAB and `iab` is not set.
 * @internal
 */
export const createNuxtEngineContext = function createNuxtEngineContext(
	input: NuxtEngineInput
): VueConsentKernelContext {
	const { committed, headers, mode } = input;
	let records =
		input.initialRecords ??
		(input.readsRecords
			? readStoredRecordsFromCookieHeader(
					document.cookie,
					input.config.storageConfig,
					Date.now()
				)
			: undefined);
	let { config } = input;
	let now: number | undefined;
	if (committed) {
		records = { ...records, ...committed.records };
		// The records were made after the server's clock; the kernel takes a
		// record newer than its clock for an invalid one.
		now = Date.now();
		config = committedConfig(config, committed);
	}
	return createVueConsentKernelContext({
		config: config as ConsentConfig,
		headers,
		host: 'nuxt',
		initialRecords: records,
		mode: clientMode(withClientData(mode, headers), {
			backendURL: config.backendURL,
			routePrefix: input.routePrefix,
		}),
		now,
		onIABUnavailable: input.onIABUnavailable,
		prefetchState: input.prefetchState,
	});
};
