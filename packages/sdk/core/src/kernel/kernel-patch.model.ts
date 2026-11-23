import type { ConsentSnapshot } from '../consent-kernel.model';
/**
 * Snapshot patching for the kernel: `./next-snapshot.model.ts` with the policy
 * resolution from `../policy`.
 *
 * Callers describe which input fields change; `buildNextSnapshot` merges
 * the patch, re-runs the pure evaluator and re-derives every dependent
 * field. Derived fields keep their previous reference when their value did
 * not change, so subscribers can rely on `===`.
 *
 * Pure: takes the current snapshot + a patch, returns the next snapshot.
 * Does not notify subscribers.
 */
import { buildEvaluationPolicy, resolveEffectivePolicy } from '../policy';
import { buildNextSnapshot as buildNextSnapshotWith } from './next-snapshot.model';
import type { SnapshotPatch } from './next-snapshot.model';

// oxlint-disable-next-line oxc/no-barrel-file -- The kernel's patch interface.
export {
	derivePrivacySignals,
	isUnchangedPatch,
	snapshotChanged,
} from './next-snapshot.model';
export type { SnapshotPatch } from './next-snapshot.model';

const policies = { buildEvaluationPolicy, resolveEffectivePolicy };

/**
 * Merge a patch over the current snapshot and re-derive every dependent
 * field. Returns an unfrozen candidate at `revision + 1`; the kernel
 * decides whether anything changed before adopting it.
 */
export const buildNextSnapshot = function buildNextSnapshot(
	current: ConsentSnapshot,
	patch: SnapshotPatch
): ConsentSnapshot {
	return buildNextSnapshotWith(current, patch, policies);
};
