/**
 * `/v1/consent/*` schemas: init, manifest, records, sessions and check.
 *
 * @packageDocumentation
 */

import * as v from 'valibot';

import { ADDITIONAL_CONSENT_V2_PATTERN } from '../../shared/ad-tech-provider';
import type { ConsentManifest } from '../../shared/consent-manifest';
import { isPlainPolicyObject } from '../../shared/policy-rule';
import { POLICY_OPTIONAL_CATEGORIES } from '../../shared/policy-rule-invariants';
import { initOutputSchema } from '../init';
import type { InitOutput } from '../init';
import {
	consentSessionJourneySchema,
	consentSessionReportSchema,
} from '../session';
import { subjectCategoryReceiptWireSchema } from '../subject/choice-wire';
import { vendorChoiceWireSchema } from '../subject/vendor-choice-wire';
import {
	v1CanonicalSubjectIdSchema,
	v1EpochMillisecondsSchema,
	v1ExternalIdSchema,
	v1IdempotencyKeySchema,
	v1IdentityProviderSchema,
	v1IdentityTokenSchema,
	v1PropertySchema,
	v1SubjectIdSchema,
} from './common';

const plainObjectSchema = v.custom<Record<string, unknown>>(
	(input) => isPlainPolicyObject(input),
	'Expected a plain object'
);

// ---------------------------------------------------------------------------
// GET /v1/consent/init
// ---------------------------------------------------------------------------

const optionalQueryString = (description: string) =>
	v.optional(v.pipe(v.string(), v.description(description)));

/** Query of `GET /v1/consent/init`. */
export const v1ConsentInitQuerySchema = v.object({
	country: optionalQueryString('Country override, ISO 3166-1 alpha-2.'),
	experiment: optionalQueryString(
		'Banner-experiment arm as `<id>=<arm>`, while no choice is stored.'
	),
	gpc: v.optional(
		v.pipe(
			v.picklist(['0', '1']),
			v.description('Global Privacy Control override.')
		)
	),
	journey: v.optional(
		v.pipe(v.string(), v.uuid(), v.description('Consent journey ID.'))
	),
	journeyScope: v.optional(
		v.pipe(v.picklist(['page', 'tab']), v.description('Consent journey scope.'))
	),
	region: optionalQueryString('Region override, ISO 3166-2 subdivision code.'),
	stored: v.optional(
		v.pipe(
			v.picklist(['0', '1']),
			v.description('Whether a choice was stored when the journey started.')
		)
	),
});

export const v1ConsentInitOutputSchema = initOutputSchema;

// ---------------------------------------------------------------------------
// POST /v1/consent/records
// ---------------------------------------------------------------------------

/** Categories an answer may hold a receipt for. */
export const V1_ANSWER_CATEGORIES = [
	'necessary',
	...POLICY_OPTIONAL_CATEGORIES,
] as const;

export type V1AnswerCategory = (typeof V1_ANSWER_CATEGORIES)[number];

const answerCategoryEntries = Object.fromEntries(
	V1_ANSWER_CATEGORIES.map((category) => [
		category,
		v.optional(subjectCategoryReceiptWireSchema),
	])
) as Record<
	V1AnswerCategory,
	v.OptionalSchema<typeof subjectCategoryReceiptWireSchema, undefined>
>;

/**
 * The subject's answer after an action: one receipt for every category with
 * an explicit value, each with the time and policy basis it was confirmed
 * under. `necessary` may be left out and counts as `true`.
 *
 * The backend merges an answer into the stored one: per category, the
 * receipt with the newer `confirmedAt` wins, and a category the answer
 * leaves out keeps its stored receipt. So an answer may be partial, such as
 * a queued save a newer action partly superseded.
 */
export const v1ConsentAnswerSchema = v.pipe(
	plainObjectSchema,
	v.strictObject({
		categories: v.pipe(
			plainObjectSchema,
			v.strictObject(answerCategoryEntries)
		),
	})
);

/** The policy decision a save asserts when it carries no snapshot token. */
const decisionAssertionEntries = {
	country: v.optional(
		v.nullable(
			v.pipe(v.string(), v.description('Country input of the decision.'))
		)
	),
	fingerprint: v.optional(
		v.pipe(v.string(), v.description('Runtime policy fingerprint asserted.'))
	),
	gpc: v.optional(
		v.pipe(v.boolean(), v.description('Global Privacy Control input.'))
	),
	language: v.optional(
		v.pipe(v.string(), v.description('Language input of the decision.'))
	),
	policyId: v.optional(
		v.nullable(
			v.pipe(
				v.string(),
				v.description(
					'Policy ID to recompute on write. Null asserts that no policy matched.'
				)
			)
		)
	),
	region: v.optional(
		v.nullable(
			v.pipe(v.string(), v.description('Region input of the decision.'))
		)
	),
};

/**
 * Body of `POST /v1/consent/records`: one banner answer.
 *
 * `answer` is the answer after the action; `confirmed` names the categories
 * this action confirmed, each a key of `answer.categories`, in no
 * particular order. `externalId` is stored as a link only with a valid
 * `identityToken`; a missing or invalid token leaves the link off and the
 * save still succeeds.
 */
export const v1ConsentRecordInputSchema = v.pipe(
	v.object({
		...decisionAssertionEntries,
		addtlConsent: v.optional(
			v.pipe(
				v.string(),
				v.regex(
					ADDITIONAL_CONSENT_V2_PATTERN,
					'Invalid Additional Consent v2 string'
				),
				v.description(
					'Google Additional Consent v2 string. Stored only with tcString.'
				)
			)
		),
		answer: v1ConsentAnswerSchema,
		confirmed: v.pipe(
			v.array(v.picklist(V1_ANSWER_CATEGORIES)),
			v.description('Categories this action confirmed. May be empty.')
		),
		consentAction: v.optional(
			v.pipe(
				v.string(),
				v.description('User action that produced this answer.'),
				v.examples(['all', 'necessary', 'custom'])
			)
		),
		externalId: v.optional(v1ExternalIdSchema),
		givenAt: v1EpochMillisecondsSchema,
		idempotencyKey: v1IdempotencyKeySchema,
		identityProvider: v.optional(v1IdentityProviderSchema),
		identityToken: v.optional(v1IdentityTokenSchema),
		metadata: v.optional(
			v.pipe(
				v.record(v.string(), v.unknown()),
				v.description('Audit metadata to store with the answer.')
			)
		),
		model: v.optional(
			v.pipe(
				v.string(),
				v.description('Consent model the client applied.'),
				v.examples(['opt-in', 'opt-out', 'iab'])
			)
		),
		policySnapshotToken: v.optional(
			v.pipe(
				v.string(),
				v.description('Signed policy snapshot token from init.')
			)
		),
		property: v1PropertySchema,
		subjectId: v1SubjectIdSchema,
		tcString: v.optional(
			v.pipe(v.string(), v.description('IAB TCF TC string.'))
		),
		uiSource: v.optional(
			v.pipe(
				v.string(),
				v.description('UI surface that collected the answer.'),
				v.examples(['banner', 'dialog', 'widget'])
			)
		),
		vendorChoice: v.optional(vendorChoiceWireSchema),
	}),
	v.forward(
		v.check(
			(input) =>
				input.confirmed.every(
					(category) => input.answer.categories[category] !== undefined
				),
			'Every confirmed category must have a receipt in answer'
		),
		['confirmed']
	)
);

/**
 * Whether the external ID sent with a save was stored as a link. A link left
 * off is not an error: the save was recorded either way. `unverified` means
 * the save carried no identity token, `invalid_token` one that did not
 * verify.
 */
export const v1ConsentRecordLinkSchema = v.variant('stored', [
	v.object({
		stored: v.literal(true),
		verifiedBy: v.literal('identity_token'),
	}),
	v.object({
		reason: v.picklist(['unverified', 'invalid_token']),
		stored: v.literal(false),
	}),
]);

/**
 * Answer of `POST /v1/consent/records`. `subjectId` is canonical: the client
 * stores it in place of a `sub_` ID.
 */
export const v1ConsentRecordOutputSchema = v.object({
	link: v.optional(v1ConsentRecordLinkSchema),
	recordId: v.pipe(
		v.string(),
		v.uuid('Record ID must be a UUID'),
		v.description('ID of the event that recorded the save.')
	),
	subjectId: v1CanonicalSubjectIdSchema,
});

// ---------------------------------------------------------------------------
// POST /v1/consent/sessions
// ---------------------------------------------------------------------------

const { domain: _journeyDomain, ...journeyEntries } =
	consentSessionJourneySchema.entries;

/** The consent journey of a session report, with its site as `property`. */
export const v1ConsentSessionJourneySchema = v.object({
	...journeyEntries,
	property: v.optional(v1PropertySchema),
});

/**
 * Body of `POST /v1/consent/sessions`, sent by a server that resolved init
 * from a manifest. The visitor's IP and user agent travel as headers.
 */
export const v1ConsentSessionReportSchema = v.object({
	...consentSessionReportSchema.entries,
	journey: v.optional(v1ConsentSessionJourneySchema),
});

// ---------------------------------------------------------------------------
// GET /v1/consent/check (secret key)
// ---------------------------------------------------------------------------

export const v1ConsentCheckQuerySchema = v.object({
	externalId: v1ExternalIdSchema,
	type: v.pipe(
		v.string(),
		v.minLength(1),
		v.description('Consent type, or comma-separated types, to check.'),
		v.examples(['cookie_banner', 'privacy_policy,terms_us'])
	),
});

export const v1ConsentCheckResultSchema = v.object({
	hasConsent: v.boolean(),
	/**
	 * For a document type: the person accepted the latest version that
	 * requires acceptance.
	 */
	isLatestPolicy: v.boolean(),
});

/**
 * One result per type asked about. Checked by hand: `v.record` drops a key
 * such as `constructor`, a valid document type, and still succeeds.
 */
const checkResultsSchema = v.custom<
	Record<string, v.InferOutput<typeof v1ConsentCheckResultSchema>>
>(
	(input) =>
		isPlainPolicyObject(input) &&
		Object.values(input).every((result) =>
			v.is(v1ConsentCheckResultSchema, result)
		),
	'Expected a check result for each type'
);

export const v1ConsentCheckOutputSchema = v.object({
	results: checkResultsSchema,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type V1ConsentInitQuery = v.InferOutput<typeof v1ConsentInitQuerySchema>;
export type V1ConsentInitOutput = InitOutput;
export type V1ConsentManifest = ConsentManifest;
export type V1ConsentAnswer = v.InferOutput<typeof v1ConsentAnswerSchema>;
export type V1ConsentRecordInput = v.InferOutput<
	typeof v1ConsentRecordInputSchema
>;
export type V1ConsentRecordLink = v.InferOutput<
	typeof v1ConsentRecordLinkSchema
>;
export type V1ConsentRecordOutput = v.InferOutput<
	typeof v1ConsentRecordOutputSchema
>;
export type V1ConsentSessionJourney = v.InferOutput<
	typeof v1ConsentSessionJourneySchema
>;
export type V1ConsentSessionReport = v.InferOutput<
	typeof v1ConsentSessionReportSchema
>;
export type V1ConsentCheckQuery = v.InferOutput<
	typeof v1ConsentCheckQuerySchema
>;
export type V1ConsentCheckResult = v.InferOutput<
	typeof v1ConsentCheckResultSchema
>;
export type V1ConsentCheckOutput = v.InferOutput<
	typeof v1ConsentCheckOutputSchema
>;
