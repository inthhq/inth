/**
 * Pure helpers for the durable opt-out record: location rights lookup, rights
 * union, liftability checks and the live GPC recording trigger.
 */
import { OPT_OUT_RIGHTS, resolveOptOutRights } from '@inth/sdk-schema/types';
import type { OptOutRecord, OptOutRight } from '@inth/sdk-schema/types';

import type { ConsentSnapshot } from '../types';

/**
 * Rights an opt-out refuses for the snapshot's effective location.
 * Developer overrides win over the backend's location, matching `resolveUSState`.
 */
export const optOutRightsForSnapshot = function optOutRightsForSnapshot(
	snapshot: Pick<ConsentSnapshot, 'location' | 'overrides'>
): OptOutRight[] {
	return resolveOptOutRights({
		country:
			snapshot.overrides.country ?? snapshot.location?.countryCode ?? null,
		region: snapshot.overrides.region ?? snapshot.location?.regionCode ?? null,
	});
};

/** Union of two right lists in canonical order (`sale`, `share`, `targeted_ads`). */
export const mergeOptOutRights = function mergeOptOutRights(
	existing: readonly OptOutRight[],
	needed: readonly OptOutRight[]
): OptOutRight[] {
	const merged = new Set<OptOutRight>([...existing, ...needed]);
	return OPT_OUT_RIGHTS.filter((right) => merged.has(right));
};

/**
 * Next durable opt-out record for a visitor-initiated opt-out at `actionAt`,
 * or `null` when an existing record already covers every right the visitor's
 * location needs. Preserves `heldBy` when expanding an existing record.
 */
export const nextButtonOptOutRecord = function nextButtonOptOutRecord(
	snapshot: Pick<ConsentSnapshot, 'location' | 'optOut' | 'overrides'>,
	actionAt: number
): OptOutRecord | null {
	const needed = optOutRightsForSnapshot(snapshot);
	if (
		snapshot.optOut !== null &&
		needed.every((right) => snapshot.optOut?.rights.includes(right))
	) {
		return null;
	}
	return snapshot.optOut === null
		? {
				heldBy: 'device',
				method: 'button',
				recordedAt: actionAt,
				rights: needed,
			}
		: {
				heldBy: snapshot.optOut.heldBy,
				method: 'button',
				recordedAt: actionAt,
				rights: mergeOptOutRights(snapshot.optOut.rights, needed),
			};
};

/**
 * Reason an opt-out cannot be lifted locally, or `null` when it can.
 *
 * The `held-by-account` check is the single place a later network change
 * replaces with a backend call to lift an account-held opt-out.
 */
export const optOutLiftBlocker = function optOutLiftBlocker(
	snapshot: ConsentSnapshot
): 'not-opted-out' | 'gpc-active' | 'held-by-account' | null {
	const { optOut } = snapshot;
	if (!optOut) {
		return 'not-opted-out';
	}
	if (
		snapshot.privacySignals.gpc.active &&
		snapshot.evaluationPolicy.gpcDenyCategories.length > 0
	) {
		return 'gpc-active';
	}
	if (optOut.heldBy === 'person' || optOut.heldBy === 'both') {
		return 'held-by-account';
	}
	return null;
};

/**
 * Whether a live kernel must record a durable GPC opt-out for `snapshot`.
 */
export const gpcOptOutDue = function gpcOptOutDue(
	snapshot: ConsentSnapshot,
	live: boolean
): boolean {
	return (
		live &&
		!snapshot.externalPermissions &&
		!snapshot.policyPending &&
		snapshot.resolution.status === 'matched' &&
		snapshot.privacySignals.gpc.active &&
		snapshot.evaluationPolicy.gpcDenyCategories.length > 0 &&
		snapshot.optOut === null
	);
};
