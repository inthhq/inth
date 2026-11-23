/**
 * Shared types for the window-debug module.
 */
import type { KernelHosting } from '../../consent-kernel.model';

/**
 * The transport kind reported on `window.__inthDebug`. Reflects what the
 * adapter actually built.
 */
export type WindowDebugMode = 'hosted' | 'offline' | 'manifest' | 'custom';

/**
 * Options for {@link createWindowDebug}.
 */
export interface WindowDebugOptions {
	/** Adapter package name, e.g. `@inth/react`. */
	pkg: string;
	/** Resolved transport kind the adapter is running with. */
	mode: WindowDebugMode;
	/**
	 * Reads who runs the backend, from the kernel snapshot. Called on each
	 * read of `window.__inthDebug.hosting`, because `/v1/consent/init` answers after install.
	 */
	getHosting?: () => KernelHosting | null;
}

/**
 * Lifecycle handle returned by {@link createWindowDebug}.
 */
export interface WindowDebugHandle {
	/**
	 * Removes `window.__inthDebug` — only when it is still the exact object this
	 * handle installed, so an unmounting older provider cannot clobber a
	 * newer provider's debug object.
	 */
	dispose: () => void;
}

/**
 * The frozen object installed at `window.__inthDebug`. Public, read-only
 * metadata for debugging and for detecting Inth on a page — never the
 * store, consent state, or backend configuration.
 */
export interface InthWindowDebug {
	/** The `inth` core package version. */
	readonly version: string;
	/** The installed adapter package name, e.g. `@inth/nextjs`. */
	readonly pkg: string;
	/** The resolved transport kind. */
	readonly mode: WindowDebugMode;
	/**
	 * Who runs the backend, as `/v1/consent/init` reported it: `'inth'` or
	 * `'self-hosted'`. `null` until init resolves, and for transports or
	 * backends that do not report it. Not verified.
	 */
	readonly hosting: KernelHosting | null;
}

/**
 * Provider transport factory metadata used by
 * {@link resolveWindowDebugMode}.
 */
export interface WindowDebugModeInput {
	/** Transport kind declared by the factory. */
	readonly kind: WindowDebugMode;
}
