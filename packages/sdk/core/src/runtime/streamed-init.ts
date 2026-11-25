import type {
	ConsentKernel,
	InitContext,
	InitResponse,
	KernelConfig,
	KernelOverrides,
	KernelTransport,
} from '../consent-kernel.model';
/**
 * The first `init()` of a runtime whose `prefetch` was a promise.
 *
 * A host that streams its prefetch passes `streamPrefetch` (this code
 * imported statically) or `lazyStreamPrefetch` (imported once a prefetch is
 * a promise) in the provider runtime's modules; one that never does ships
 * none of this. A provider shared by both kinds of host imports this module
 * through `@inth/sdk/runtime/streamed-init` and wraps it with
 * `streamPrefetchWith` where it streams: the Next.js and TanStack Start
 * roots do, through the React provider.
 *
 * - A config that resolves with a policy becomes the init response
 *   outright: no network request. The runtime's own `overrides` win over
 *   the server's, as they do for a ready prefetch.
 * - A config without a policy (stored records, geo, language only) is a
 *   baseline: its overrides and records are applied to the kernel, then the
 *   transport's init runs with those overrides. Records apply through
 *   hydration rather than through the init response, so a returning
 *   visitor's choice holds even when that init fails.
 * - A rejected promise is logged outside production and the transport's
 *   init runs as though there were no prefetch.
 */
import type { InternalKernel } from '../kernel/kernel-internals.model';
import { isProductionBuild } from '../libs/is-production';
import type { kernelConfigToInitResponse } from '../transports/init-output';
import type { RuntimePrefetch } from './consent-runtime.model';

const hasKeys = function hasKeys(value: KernelOverrides): boolean {
	return Object.keys(value).length > 0;
};

const warn = function warn(...message: unknown[]): void {
	if (!isProductionBuild()) {
		console.warn(...message);
	}
};

const stripStreamedAccountData = function stripStreamedAccountData(
	config: RuntimePrefetch
): RuntimePrefetch {
	const {
		initialUser: _user,
		initialUserConsent: _consent,
		initialRecords,
		...rest
	} = config;
	if (!initialRecords?.accountLayer) {
		return initialRecords === undefined ? rest : { ...rest, initialRecords };
	}
	const { accountLayer: _accountLayer, ...restRecords } = initialRecords;
	return { ...rest, initialRecords: restRecords };
};

/** Inputs for {@link resolveStreamedInit}. */
export interface StreamedInitOptions {
	/** The context the kernel called `init()` with. */
	context: InitContext;
	/**
	 * Whether the stream's identity epoch is still current. When `false`,
	 * `initialUser`, `initialUserConsent`, and `initialRecords.accountLayer`
	 * are stripped so a fenced stream installs policy only.
	 */
	isStreamAllowed?: () => boolean;
	/** The kernel being initialized, once it exists. */
	kernel: ConsentKernel | null;
	/** Called with the resolved config before it is applied. */
	onResolved: (config: KernelConfig) => void;
	/** The runtime's own overrides, which win over the server's. */
	overrides: KernelOverrides | undefined;
	prefetch: PromiseLike<RuntimePrefetch>;
	/**
	 * The kernel's records generation when `init()` started. Prefetched
	 * records only apply while it is unchanged, so a clear wins.
	 */
	recordsGeneration: number | undefined;
	/** Whether the runtime runs an experiment of its own. */
	runsExperiment: boolean;
	/** The transport to fall back to. */
	transport: KernelTransport;
	/**
	 * `kernelConfigToInitResponse`, passed in rather than imported so a
	 * resolver loaded on demand shares no module with the first-load chunk.
	 */
	toInitResponse: typeof kernelConfigToInitResponse;
}

const applyStreamedBaseline = function applyStreamedBaseline(
	kernel: ConsentKernel | null,
	config: RuntimePrefetch,
	overrides: KernelOverrides | undefined,
	recordsGeneration: number | undefined
): KernelOverrides {
	const baseline = {
		...(config.initialOverrides ?? {}),
		...(overrides ?? {}),
	};
	if (!kernel) {
		return baseline;
	}
	if (hasKeys(baseline)) {
		kernel.set.overrides(baseline);
	}
	if (
		config.initialRecords &&
		kernel.getRecordsGeneration() === recordsGeneration
	) {
		(kernel as InternalKernel).hydrate(config.initialRecords);
	}
	return baseline;
};

/**
 * Wait for a streamed prefetch and turn it into the first init response.
 *
 * @returns The init response the kernel applies.
 * @internal
 */
export const resolveStreamedInit = async function resolveStreamedInit(
	options: StreamedInitOptions
): Promise<InitResponse> {
	const { context, kernel, overrides, transport } = options;
	let config: RuntimePrefetch;
	try {
		config = (await options.prefetch) ?? {};
	} catch (error) {
		warn('inth: prefetch rejected; using transport init.', error);
		return transport.init?.(context) ?? {};
	}
	if (config.experiment && !options.runsExperiment) {
		warn(
			'inth: the streamed consent state carries an experiment, but the runtime started before it arrived and runs none. Await the server result, or also pass `experiment` to the options.'
		);
	}
	const effectiveConfig =
		options.isStreamAllowed?.() === false
			? stripStreamedAccountData(config)
			: config;
	options.onResolved(effectiveConfig);

	const response = options.toInitResponse(effectiveConfig);
	if (response) {
		const resolvedOverrides = {
			...(response.resolvedOverrides ?? {}),
			...(overrides ?? {}),
		};
		if (hasKeys(resolvedOverrides)) {
			response.resolvedOverrides = resolvedOverrides;
		}
		return response;
	}

	const baseline = applyStreamedBaseline(
		kernel,
		effectiveConfig,
		overrides,
		options.recordsGeneration
	);
	return (
		transport.init?.({
			...context,
			overrides: { ...context.overrides, ...baseline },
		}) ?? {}
	);
};
