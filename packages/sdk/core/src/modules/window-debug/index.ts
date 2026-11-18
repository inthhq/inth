/**
 * `@inth/sdk/modules/window-debug`
 *
 * Client-only debug and adapter identification module. Installs a tiny,
 * read-only `window.__inthDebug` object for browser inspection after a framework
 * adapter has mounted. This is the v3 successor to v2's `window.inthStore`
 * exposure, but intentionally exposes only public metadata (`version`,
 * `pkg`, `mode`, `hosting`) instead of the mutable store. `window.inth`
 * is the script-tag API's (`@inth/sdk`), so the two never replace each
 * other.
 *
 * Concerns are split across siblings:
 * - `types.ts` — public type definitions.
 * - `index.ts` — this file: installation + lifecycle.
 *
 * Invariants:
 * - Isomorphic-safe: in non-browser environments the handle is inert.
 * - Best-effort: if a host page defined `window.__inthDebug` as non-writable,
 *   install/dispose degrade to no-ops instead of throwing — this hook
 *   must never take the consent provider down with it. Adapters that
 *   call it synchronously during mount (Vue, Svelte) rely on this.
 * - Last writer wins: mounting a newer provider replaces `window.__inthDebug`.
 * - Dispose is identity-checked so an older handle cannot remove a newer
 *   provider's debug object.
 * - The installed object is frozen.
 */
import { version } from '../../version';
import type {
	InthWindowDebug,
	WindowDebugHandle,
	WindowDebugMode,
	WindowDebugModeInput,
	WindowDebugOptions,
} from './types';

export type {
	InthWindowDebug,
	WindowDebugHandle,
	WindowDebugMode,
	WindowDebugModeInput,
	WindowDebugOptions,
} from './types';

/**
 * Resolves the {@link WindowDebugMode} to report for a provider-style
 * adapter (React, Svelte, Next.js). Shared so adapters cannot drift from
 * the transport factory's declared kind.
 *
 * Vue resolves its own mode (`manifest` vs `hosted`) — its config has
 * no provider-mode concept.
 *
 * @param mode - The adapter's provider transport factory metadata.
 * @returns The transport kind to report on `window.__inthDebug`.
 */
export const resolveWindowDebugMode = function resolveWindowDebugMode(
	mode: WindowDebugModeInput
): WindowDebugMode {
	return mode.kind;
};

type WindowWithInthDebug = Window & {
	__inthDebug?: InthWindowDebug;
};

const inertHandle: WindowDebugHandle = {
	dispose() {
		/* empty */
	},
};

/**
 * Installs a frozen `window.__inthDebug` debug object describing the mounted
 * Inth adapter: `{ version, pkg, mode, hosting }`.
 *
 * @param options - The adapter identity to report: `pkg` (installed
 * adapter package name) and `mode` (resolved transport kind).
 * @returns A handle whose `dispose()` removes `window.__inthDebug` — only if it
 * still is the object this call installed. Inert outside the browser or
 * when the page blocks the write.
 *
 * @example
 * ```ts
 * const handle = createWindowDebug({ pkg: '@inth/react', mode: 'hosted' });
 * // window.__inthDebug -> { version: '2.1.0', pkg: '@inth/react', mode: 'hosted', hosting: null }
 * handle.dispose();
 * ```
 */
export const createWindowDebug = function createWindowDebug(
	options: WindowDebugOptions
): WindowDebugHandle {
	if (typeof window === 'undefined') {
		return inertHandle;
	}

	const target = window as WindowWithInthDebug;
	const { getHosting } = options;
	const installed: InthWindowDebug = Object.freeze({
		get hosting() {
			return getHosting?.() ?? null;
		},
		mode: options.mode,
		pkg: options.pkg,
		version,
	});

	try {
		target.__inthDebug = installed;
	} catch {
		// A host page defined `window.__inthDebug` as non-writable — strict-mode
		// assignment throws. The debug hook is best-effort; never let it
		// abort a provider that installs it synchronously during mount.
		return inertHandle;
	}

	return {
		dispose() {
			if (target.__inthDebug === installed) {
				try {
					delete target.__inthDebug;
				} catch {
					// Non-configurable property — leave it in place.
				}
			}
		},
	};
};
