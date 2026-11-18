/**
 * Forward subject decisions to the native core.
 */

import { useCallback, useMemo } from 'react';

import { useConsentDraftStore } from '../draft/consent-draft-provider';
import type {
	CommitIntent,
	CommitResult,
	NativeOverridesInput,
	TrackingAuthorization,
} from '../protocol';
import type { OptionalConsentCategory } from '../protocol/vocabulary';
import { useConsentClient } from '../provider/consent-context';

/**
 * The commands a consent surface can take that `@inth/react` has no hook for.
 *
 * Saving, identifying, overrides and notice dismissal have their own hooks with
 * the web names: {@link useSaveConsents}, {@link useIdentify},
 * {@link useSetOverrides} and {@link useDismissNotice}.
 *
 * The object is stable for the life of the provider, so it is safe in a
 * dependency list or a memoized component.
 */
export interface ConsentActions {
	/**
	 * Re-resolve policy, re-evaluate, and retry the offline queue.
	 */
	refresh: () => Promise<void>;
	/**
	 * Detach the external id. Consent stays with the Inth subject id, so
	 * signing out does not reset consent.
	 */
	logout: () => Promise<void>;
	/**
	 * Wipe consent and return the device to the state a first launch boots
	 * with.
	 *
	 * The subject owes the choice prompt again afterwards, so the banner or
	 * dialog comes back: this is a withdrawal that has to be answered again, not
	 * a recorded reject-everything. It is the surface for a "start over" affordance
	 * and for a reviewer who needs the fresh-install state without reinstalling.
	 *
	 * The Inth subject id is kept, because the backend holds an audit history
	 * keyed to it; erasing what the backend holds for that subject is a backend
	 * call, not something this wipe can do on the device. Overrides and the
	 * configured category scope are kept as well, since they are configuration
	 * rather than consent.
	 *
	 * Resolves once the local state is durable. It does not wait on a consent save
	 * that was already travelling when the wipe landed: the native core cannot
	 * recall a request it has handed to the transport, and anything still queued
	 * goes with the queue. Policy re-resolves in the background the way a first
	 * launch does, so a banner that comes back may arrive a moment later than the
	 * promise.
	 */
	reset: () => Promise<void>;
	/**
	 * Ask the platform for tracking authorization.
	 *
	 * Nothing in this package calls it, and nothing in this package can: the
	 * platform prompt belongs after your own consent UI, so that the system dialog
	 * is never the first thing a subject reads about tracking. Call it once the
	 * subject has answered, and read the answer with
	 * {@link useIsTrackingAllowed} rather than from this promise alone.
	 *
	 * Whether this can produce a prompt is Apple's call. Outside the European Union the
	 * dialog appears once and later calls resolve with the answer on the device. Inside
	 * it, an answered request may come back a year later, whichever way it went, and the
	 * only way to find out whether this install is eligible is to ask. It rejects with
	 * `INTH_TRACKING_NOT_CONFIGURED` on an iOS build whose `Info.plist` carries no
	 * `NSUserTrackingUsageDescription`, where the system dialog is suppressed and the
	 * answer comes back denied without a word, and with `INTH_TRACKING_UNSUPPORTED` on
	 * Android, where there is no platform question to ask.
	 *
	 * @returns The platform arm after the request settled.
	 */
	requestTrackingAuthorization: () => Promise<TrackingAuthorization>;
}

/**
 * Get the commands for the mounted native core that web has no hook for.
 *
 * @returns A stable action object.
 */
export const useConsentActions = function useConsentActions(): ConsentActions {
	const client = useConsentClient();

	return useMemo(
		() => ({
			logout: () => client.logout(),
			refresh: () => client.refresh(),
			requestTrackingAuthorization: () => client.requestTrackingAuthorization(),
			reset: () => client.reset(),
		}),
		[client]
	);
};

/**
 * What {@link useSaveConsents} accepts, matching `@inth/react`'s `save`.
 *
 * - `'all'` grants every category in the policy scope.
 * - `'none'` grants necessary only.
 * - An object records an explicit per-category choice, the shape a preference
 *   centre saves. Only the categories you pass are written. Omitted categories
 *   keep their stored receipts, which is what stops a preference-centre save
 *   from renewing a consent the subject never looked at.
 */
export type SaveConsentsInput =
	| 'all'
	| 'none'
	| Readonly<Partial<Record<OptionalConsentCategory, boolean>>>;

/** The native intent for an explicit {@link SaveConsentsInput}. */
const intentFor = function intentFor(input: SaveConsentsInput): CommitIntent {
	if (input === 'all') {
		return { action: 'all' };
	}
	if (input === 'none') {
		return { action: 'necessary' };
	}
	return { action: 'explicit', consents: input };
};

/**
 * Save the subject's consent choice, as `@inth/react`'s `save` does.
 *
 * With no argument it saves the current draft: the nearest
 * `ConsentDraftProvider`'s, or the draft every `useConsentDraft()` outside one
 * shares. A stale draft is refused with `reason: 'concurrent-change'`.
 *
 * @example
 * ```tsx
 * const save = useSaveConsents();
 * <Button onPress={() => save('all')} title="Accept all" />
 * <Button onPress={() => save()} title="Save choices" />
 * ```
 *
 * @returns A stable function. Its promise resolves with the local commit
 *   outcome: check `ok` before treating the action as saved. `ok: true,
 *   queued: true` is durable local success. Delivery is separate.
 */
export const useSaveConsents = function useSaveConsents(): (
	input?: SaveConsentsInput
) => Promise<CommitResult> {
	const client = useConsentClient();
	const draft = useConsentDraftStore();

	return useCallback(
		async (input?: SaveConsentsInput) => {
			if (input === undefined) {
				return draft.save();
			}
			const { iab: submittedIAB, values: submitted } = draft.getState();
			const result = await draft.whileSaving(() =>
				client.commit(intentFor(input))
			);
			// A saved choice supersedes the edits the draft held when it was made, as on
			// web; an edit made while the save was pending is newer and stays.
			if (result.ok) {
				draft.settle(submitted, result.revision, submittedIAB);
			}
			return result;
		},
		[client, draft]
	);
};

/**
 * Attach an external id to the subject, and link it on the backend when an
 * identity token comes with it.
 *
 * `externalId` is the id from the app's own account system; it goes on every
 * later consent record. `identityToken` is signed proof of that id, minted by
 * your server. On iOS and Android, without a token nothing is sent, and the
 * token is used for that one request and never stored, so pass a fresh one
 * each time.
 *
 * @returns A stable function that takes the user.
 */
export const useIdentify = function useIdentify(): (user: {
	readonly externalId: string;
	readonly identityToken?: string;
}) => Promise<void> {
	const client = useConsentClient();

	return useCallback(
		(user: { readonly externalId: string; readonly identityToken?: string }) =>
			client.identify(user.externalId, user.identityToken),
		[client]
	);
};

/**
 * Pin country, region, language, or the GPC signal. There is no test override:
 * publisher test mode is a client option, not an override.
 *
 * Useful for a debug menu and for review-gated builds that must evaluate a
 * specific region's policy. Overrides change which rule matches; they never
 * create a consent record.
 *
 * @returns A stable function that takes the fields to change. Omitted fields
 *   keep their value, and an explicit `null` clears one.
 */
export const useSetOverrides = function useSetOverrides(): (
	overrides: NativeOverridesInput
) => Promise<void> {
	const client = useConsentClient();

	return useCallback(
		(overrides: NativeOverridesInput) => client.setOverrides(overrides),
		[client]
	);
};

/**
 * Record that the current notice was dismissed.
 *
 * Local and synchronous: a notice is an acknowledgement, not a written consent
 * record, so nothing is sent to the backend.
 *
 * @returns A stable function.
 */
export const useDismissNotice = function useDismissNotice(): () => void {
	const client = useConsentClient();

	return useCallback(() => {
		client.dismissNotice();
	}, [client]);
};
