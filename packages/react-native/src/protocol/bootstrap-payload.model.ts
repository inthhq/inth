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
	 * Native SDK version, which the core sends in the `x-inth-platform`
	 * request header after the platform tag, as `rn-><version>`.
	 */
	readonly nativeSdkVersion: string;
	/**
	 * Subject id the core generated or loaded, or `null` before the first
	 * write. It is a UUIDv7 the core minted, or a c15t `sub_` id it read
	 * from storage until a backend response names the canonical UUIDv7. It is
	 * never a hardware identifier.
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
	 * build with `inth.nativeUI` false (the Expo plugin's `nativeUI: false`),
	 * where `presentConsentPrompt` and `presentPreferences` reject with
	 * `INTH_NATIVE_UI_EXCLUDED`. An older binary sends no flag; the client reads
	 * that as `true` (see `ADDITIVE_BOOTSTRAP_DEFAULTS`), because every such
	 * binary links them.
	 */
	readonly nativeUI: boolean;
}
