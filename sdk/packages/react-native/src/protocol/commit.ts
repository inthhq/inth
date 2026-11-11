/**
 * The commit boundary: what the app sends when a user decides, and what the
 * native core reports back.
 */

import type {
	ConsentState,
	ConsentSubject,
	ExplicitChoice,
	KernelActiveUI,
	KernelModel,
	OptionalConsentCategory,
} from './vocabulary';

/**
 * A consent action forwarded to the native core.
 *
 * The three shapes cover every prompt surface: an accept, a reject-everything
 * or save, and a preference-centre save. `explicit` carries exactly the
 * categories the user touched, so a partial save cannot renew a receipt the
 * user never looked at. `all` and `necessary` cover the whole choice scope;
 * to decide a subset, use `explicit`. The native decoders refuse any key the
 * action does not take, such as `consents` on `all`, with `invalid-intent`, so
 * a scope they would not honour is never silently widened.
 */
export type CommitIntent =
	| { readonly action: 'all' }
	| { readonly action: 'necessary' }
	| {
			readonly action: 'explicit';
			readonly consents: Readonly<
				Partial<Record<OptionalConsentCategory, boolean>>
			>;
			/**
			 * The snapshot revision a draft was built on. A native build whose
			 * bootstrap reports `commitRevision` refuses the commit with
			 * `concurrent-change` when the record moved since; an older one ignores it.
			 */
			readonly revision?: number;
	  }
	| {
			/**
			 * A complete TCF draft from a headless IAB screen. The native core checks
			 * every ID and legal basis against the served vendor list and encodes the
			 * TC String.
			 */
			readonly action: 'iab';
			readonly choices: NativeIABChoices;
			/** The categories this action confirms. */
			readonly consents: Readonly<
				Partial<Record<OptionalConsentCategory, boolean>>
			>;
			/**
			 * The snapshot revision the draft was opened on. Native refuses the commit
			 * with `concurrent-change` when the state moved since.
			 */
			readonly revision?: number;
	  };

/**
 * A complete TCF selection, as both native cores hold it. Each list holds IDs
 * from the served vendor list; an absent ID has no grant. Every list is
 * required, empty or not.
 */
export interface NativeIABChoices {
	readonly purposeConsents: readonly number[];
	readonly purposeLegitimateInterests: readonly number[];
	readonly purposeObjections: readonly number[];
	readonly vendorConsents: readonly number[];
	readonly vendorLegitimateInterests: readonly number[];
	readonly vendorObjections: readonly number[];
	readonly specialFeatureOptIns: readonly number[];
	readonly publisherConsents: readonly number[];
	readonly publisherLegitimateInterests: readonly number[];
	readonly publisherCustomConsents: readonly number[];
	readonly publisherCustomLegitimateInterests: readonly number[];
	/** Google Additional Consent providers, or `null` when none are listed. */
	readonly adTechProviderConsents?: readonly number[] | null;
	/**
	 * Custom (non-IAB) vendors with consent, by {@link NativeIABCustomVendor.id}.
	 * Native keeps them beside the TC String, never in it, as the web keeps them
	 * in its authority receipt. A binary older than custom vendor support omits
	 * the list, which reads as none.
	 */
	readonly customVendorConsents?: readonly string[];
	/** Custom vendors whose legitimate interest stands. One not listed is objected to. */
	readonly customVendorLegitimateInterests?: readonly string[];
}

/**
 * Why native refused a local commit.
 *
 * Pending delivery is not a refusal. A durable local success carries
 * `ok: true, queued: true` and can be used offline.
 *
 * `not-bootstrapped` is the native core refusing because no configuration was
 * ever installed, which is a host wiring bug rather than a consent outcome.
 * Both native bridges already report it; this union is what lets JavaScript
 * name it.
 *
 * A TCF commit adds its own refusals: `iab-unavailable` (no IAB policy or
 * configuration), `iab-list-stale` (the vendor list expired), `iab-draft-required`
 * (no `revision`), `iab-choices-required`, `invalid-iab-choices` (IDs or legal
 * bases the list does not allow) and `additional-consent-unavailable`. Any
 * commit can also meet `bundled-policy-unusable`, `additional-consent-list-stale`
 * and `invalid-action-time` (the device clock is not usable).
 */
export const COMMIT_FAILURE_REASONS = [
	'invalid-intent',
	'no-subject',
	'not-bootstrapped',
	'policy-pending',
	'encode-failed',
	'queue-write-failed',
	'concurrent-change',
	// IAB authority and bundled-policy refusals, which both native cores also
	// copy into `reason`.
	'bundled-policy-unusable',
	'additional-consent-list-stale',
	'additional-consent-unavailable',
	'iab-draft-required',
	'iab-unavailable',
	'iab-list-stale',
	'iab-choices-required',
	'invalid-iab-choices',
	// iOS only: thrown by `AdditionalConsent.encode` inside the IAB build and
	// forwarded by `save`. Android reports the same input as `invalid-iab-choices`.
	'invalid-additional-consent',
	'invalid-action-time',
] as const;

/** One of {@link COMMIT_FAILURE_REASONS}. */
export type CommitFailureReason = (typeof COMMIT_FAILURE_REASONS)[number];

/**
 * Result of `commit(intent)`.
 *
 * `revision` is the snapshot revision the action produced. Pull
 * `getSnapshot()` when it differs from the one a subscriber already holds.
 */
export interface CommitResult {
	/** `true` when the native core applied the action. */
	readonly ok: boolean;
	/** Snapshot revision after the action, `null` when nothing changed. */
	readonly revision: number | null;
	/** Categories this action recorded receipts for. */
	readonly confirmed: readonly OptionalConsentCategory[];
	/** Subject the receipts belong to. */
	readonly subjectId: string | null;
	/**
	 * `true` when native durably enqueued the payload. It may already have been
	 * delivered by the time this result arrives. Check `ok` for local success.
	 */
	readonly queued: boolean;
	/**
	 * Whether native reports backend acceptance before returning. Absent or
	 * `false` does not undo local success. iOS currently reports `false`.
	 */
	readonly delivered?: boolean;
	/** Present only when `ok` is `false`. */
	readonly reason?: CommitFailureReason;
	/**
	 * The start of an intent the native core could not read, at most 200
	 * characters, sent with `reason: 'invalid-intent'` for diagnostics.
	 */
	readonly detail?: string;
}

/**
 * The exact backend write the native core queued or delivered for an action.
 *
 * The pending queue stores this, not a re-derived request: a later init that
 * changes policy must not rewrite a queued payload. Native cores must
 * reproduce it byte for byte from the same inputs, which is what the
 * `save-body-*.json` fixtures assert.
 */

/**
 * Overrides as the kernel carries them on a save body.
 *
 * Not {@link NativeOverrides}: the snapshot's overrides are explicit `null` so a
 * native reader never branches on presence, while the payload the backend reads
 * keeps the kernel's optional properties, which is what a queued body written by
 * one build and replayed by another has to stay byte-identical to.
 */
export interface KernelOverrides {
	country?: string;
	region?: string;
	language?: string;
	gpc?: boolean;
}

/** The identified user carried on a save body, when the app has one. */
export interface KernelUser {
	externalId: string;
	externalIdType?: string;
	identityProvider?: string;
	/** Server-signed proof of `externalId`; the backend verifies it. */
	identityToken?: string;
	properties?: Record<string, string | number | boolean>;
}

/** Categories one save confirmed, with the single captured action time. */
export interface ConfirmedCoverage {
	categories: Readonly<Partial<Record<OptionalConsentCategory, boolean>>>;
	/** Epoch milliseconds captured once, before any yield or network call. */
	actionAt: number;
}

/**
 * The backend write for one explicit action.
 *
 * Built once, then reused unchanged by a queued replay, which is why every field
 * here is captured at action time rather than read again at delivery time.
 */
export interface SavePayload {
	subjectId: string;
	subject: Readonly<ConsentSubject>;
	/** Receipt snapshot for this action; superseded categories are omitted when delivery is narrowed. */
	choice: Readonly<ExplicitChoice>;
	/** Exactly the categories this action confirmed. */
	confirmed: ConfirmedCoverage;
	/** Effective permissions after the action. */
	consents: Readonly<ConsentState>;
	overrides: Readonly<KernelOverrides>;
	user: Readonly<KernelUser> | null;
	model: KernelModel;
	/** The surface the action came from; `widget` for an inline preference widget. */
	uiSource: KernelActiveUI | 'widget';
	consentAction: 'all' | 'necessary' | 'custom';
	policySnapshotToken: string | null;
	/**
	 * Resolved policy inputs captured with the action.
	 *
	 * The backend recomputes them before it accepts a choice, so a retry keeps
	 * the original inputs even after a later initialization changes policy.
	 */
	decisionInputs?: {
		policyId: string | null;
		fingerprint?: string;
		country: string | null;
		region: string | null;
		language: string;
		gpc: boolean;
	};
	/**
	 * TC String captured by a committed native IAB action. Requires configured
	 * CMP identity and valid native disclosure authority. Category-only actions
	 * do not produce one. Queued delivery retains the committed string.
	 */
	tcString?: string | null;
	/**
	 * Google Additional Consent v2 string sent with `tcString` when the native
	 * action includes configured provider disclosures and consent authority.
	 */
	addtlConsent?: string;
	/** Equals `confirmed.actionAt`. Kept for backends that read one time. */
	givenAt?: number;
	/**
	 * Milliseconds from the surface's first impression to this action. The
	 * native cores do not stamp impressions yet, so they never write it; it
	 * is carried so the body stays the one the kernel describes.
	 */
	timeToDecisionMs?: number;
	/**
	 * The banner-experiment arm the visitor saw. The native cores run no
	 * experiments, so they never write it; it is carried so the body stays
	 * the one the kernel describes.
	 */
	experiment?: {
		id: string;
		arm: string;
		assignedBy: 'host' | 'c15t';
		acknowledgedDiagnostics: boolean;
	};
	/**
	 * Web custom-vendor receipt, retained in the shared payload vocabulary.
	 * Native cores do not emit this field. Native TCF vendor choices are encoded
	 * in `tcString`.
	 */
	vendorChoice?: {
		version: 1;
		confirmedAt: number;
		grants: Readonly<Record<string, boolean>>;
	};
}

export type NativeSavePayload = SavePayload;
