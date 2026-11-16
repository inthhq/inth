/**
 * What the native core hands the JavaScript layer once, at provider mount.
 *
 * `getBootstrap()` is synchronous and cheap: it reads state the core already
 * holds after `bootstrap(config)` ran from a launch hook. It is the handshake
 * point, which is why the protocol range lives here rather than on the
 * snapshot.
 */

/**
 * Payload returned by `getBootstrap()`.
 */
export interface BootstrapPayload {
	/** Protocol the embedded native build speaks. */
	readonly protocolVersion: number;
	/** Oldest protocol the native build itself accepts. */
	readonly minSupportedProtocolVersion: number;
	/** Newest protocol the native build itself accepts. */
	readonly maxSupportedProtocolVersion: number;
	/**
	 * Native SDK version, which the core sends unprefixed as the
	 * `x-c15t-version` request header. The host platform travels separately
	 * in `x-c15t-platform`.
	 */
	readonly nativeSdkVersion: string;
	/**
	 * Subject id the core generated or loaded, or `null` before the first
	 * write. It is a c15t-generated `sub_` id, never a hardware identifier.
	 */
	readonly subjectId: string | null;
	/**
	 * `true` when a stored envelope was found, so a cold start with no
	 * connectivity still answers `getSnapshot()` immediately.
	 */
	readonly hasStoredSnapshot: boolean;
	/**
	 * `true` when the native build honours a commit's `revision`: it refuses
	 * the commit with `concurrent-change` if the record moved past that
	 * revision. A draft save pins itself to the revision it was built on, so a
	 * decision recorded anywhere in between is never overwritten. A binary
	 * older than this field reads as `false`; see `useConsentDraft`.
	 */
	readonly commitRevision: boolean;
	/**
	 * Whether the binary links the stock native consent screens. `false` in a
	 * build with `c15t.nativeUI` false (the Expo plugin's `nativeUI: false`),
	 * where `presentConsentPrompt` and `presentPreferences` reject with
	 * `C15T_NATIVE_UI_EXCLUDED`. An older binary sends no flag; the client reads
	 * that as `true` (see `ADDITIVE_BOOTSTRAP_DEFAULTS`), because every such
	 * binary links them.
	 */
	readonly nativeUI: boolean;
}
