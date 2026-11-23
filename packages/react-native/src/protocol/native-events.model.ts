/**
 * Bodies of the `snapshot` and `initialized` events.
 *
 * Neither carries a snapshot. The core emits the new revision and JavaScript
 * pulls with `getSnapshot()` only when a mounted subscriber needs it.
 */

/** The `snapshot` event: a committed change reached this revision. */
export interface NativeSnapshotEvent {
	readonly revision: number;
	/** Always `true`: the event exists because the snapshot moved. */
	readonly dirty: boolean;
}

/** The `initialized` event, sent once when the first policy resolves. */
export interface NativeInitializedEvent extends NativeSnapshotEvent {
	readonly ready: boolean;
	readonly policyPending: boolean;
}
