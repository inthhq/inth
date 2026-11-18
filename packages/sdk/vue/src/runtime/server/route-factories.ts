import type { ConsentManifest } from '@inth/sdk/schema/types';
/**
 * The Nitro consent route for `manifest()` mode: one h3 handler, mounted at
 * `${routePrefix}/**`, around the consent route handler in
 * `@inth/sdk/server`. Core owns the `/manifest` and `/init` behaviour for
 * every adapter (including the fallback to the backend's own `/init` and
 * the render budget the SSR plugin sends in `x-c15t-timeout-ms`). This
 * module only converts between h3 and the Web `Request`/`Response`, reads
 * the Inth runtime config, sends relative backend URLs through Nitro's
 * in-process fetch, and hands detached work to the preset's `waitUntil`.
 */
import {
	createConsentRouteHandlerCache,
	readWaitUntil,
	resolveServerMode,
} from '@inth/sdk/server';
import type { ConsentRouteHandler, ManifestFetch } from '@inth/sdk/server';
import { defineEventHandler, sendWebResponse, toWebRequest } from 'h3';
import type { EventHandlerRequest, H3Event } from 'h3';

import type { ConsentConfig } from '../config';
import { readNuxtMode, readNuxtRoutePrefix } from '../nuxt-mode';
import type { NuxtConsentModeConfig } from '../nuxt-mode';

interface InthNitroRuntimeConfig {
	inth?: Record<string, unknown>;
	public?: {
		inth?: Record<string, unknown>;
	};
}

type RuntimeConfigReader = (event?: H3Event<EventHandlerRequest>) => unknown;

type RouteConfig = ConsentConfig & NuxtConsentModeConfig;

interface RouteDependencies {
	/**
	 * Nitro's fetch: dispatches a path in-process and an absolute URL over
	 * the network, so a relative `projectUrl` such as `/api/self-host`
	 * resolves without a host.
	 */
	fetch: ManifestFetch;
	/**
	 * The manifest the build downloaded, or the `snapshot` the mode names.
	 * Without one the route reads the manifest at runtime.
	 */
	manifest?: ConsentManifest;
	useRuntimeConfig: RuntimeConfigReader;
	/**
	 * Receives the promise of detached work started by a request (a
	 * background manifest revalidation, a session report, a fill the render
	 * budget stopped waiting for), with that request's event. Defaults to
	 * {@link waitUntilFromEvent}: Nitro attaches the platform's `waitUntil`
	 * to the event on request-scoped presets (Vercel, Cloudflare, Netlify),
	 * and nothing is registered where there is none. The promise never
	 * rejects.
	 */
	onBackgroundRevalidate?: (
		revalidation: Promise<void>,
		event: H3Event<EventHandlerRequest>
	) => void;
}

/**
 * Hands a promise to the `waitUntil` Nitro places on the event when the
 * deployment preset provides one, so a background refresh outlives the
 * response on runtimes that would otherwise cancel it.
 */
export const waitUntilFromEvent = function waitUntilFromEvent(
	revalidation: Promise<void>,
	event: H3Event<EventHandlerRequest>
): void {
	readWaitUntil(event)?.(revalidation);
};

/**
 * The public `inth` config with the private one over it. A private value
 * that is empty or unset leaves the public one: the module writes an empty
 * private `projectUrl`, so `NUXT_PUBLIC_INTH_PROJECT_URL` alone moves this
 * route, and `NUXT_INTH_PROJECT_URL` gives it a server-only address.
 */
const readConsentConfig = function readConsentConfig(
	runtimeConfig: unknown
): RouteConfig {
	const config =
		typeof runtimeConfig === 'object' && runtimeConfig !== null
			? (runtimeConfig as InthNitroRuntimeConfig)
			: {};
	const serverOnly = Object.fromEntries(
		Object.entries(config.inth ?? {}).filter(
			([, value]) => value !== '' && value !== undefined && value !== null
		)
	);
	return {
		...config.public?.inth,
		...serverOnly,
	} as RouteConfig;
};

/**
 * The path below the route prefix (`init`, `manifest`), or `undefined` to
 * let the core handler read the last URL segment.
 */
const readSubpath = function readSubpath(
	event: H3Event<EventHandlerRequest>,
	request: Request,
	prefix: string | undefined
): string | undefined {
	const wildcard = (event.context.params as Record<string, string> | undefined)
		?._;
	if (typeof wildcard === 'string') {
		return wildcard;
	}
	const { pathname } = new URL(request.url);
	if (prefix && pathname.startsWith(`${prefix}/`)) {
		return pathname.slice(prefix.length + 1);
	}
	return undefined;
};

/**
 * `GET ${routePrefix}/manifest` and `GET ${routePrefix}/init`: the backend
 * manifest with its cache headers, and the visitor's init resolved from
 * it. The core handler is rebuilt only when the runtime config changes
 * where the route reads from.
 *
 * @param dependencies - Nitro's fetch and runtime config, and the snapshot.
 * @returns The h3 handler the module mounts at `${routePrefix}/**`.
 * @internal
 */
export const createConsentRoute = function createConsentRoute(
	dependencies: RouteDependencies
) {
	const cached = createConsentRouteHandlerCache();
	const handlerFor = function handlerFor(runtimeConfig: unknown): {
		handle: ConsentRouteHandler;
		prefix: string | undefined;
	} {
		const config = readConsentConfig(runtimeConfig);
		const prefix = readNuxtRoutePrefix(config);
		const { route } = resolveServerMode({
			adapter: '@inth/nuxt',
			buildSnapshot: dependencies.manifest,
			mode: readNuxtMode(config),
			projectUrl: config.projectUrl,
			routePrefix: prefix,
		});
		const handle = cached({
			...route,
			adapter: '@inth/nuxt',
			fetch: dependencies.fetch,
		});
		return { handle, prefix };
	};
	return defineEventHandler(async (event) => {
		const { handle, prefix } = handlerFor(dependencies.useRuntimeConfig(event));
		const onBackgroundRevalidate =
			dependencies.onBackgroundRevalidate ?? waitUntilFromEvent;
		const request = toWebRequest(event);
		const response = await handle(request, {
			localFetch: dependencies.fetch,
			path: readSubpath(event, request, prefix),
			waitUntil: (task) => onBackgroundRevalidate(task, event),
		});
		return sendWebResponse(event, response);
	});
};
