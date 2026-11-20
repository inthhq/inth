import type {
	V1ConsentAnswer,
	V1ConsentRecordInput,
} from '@inth/sdk-schema/types';

import { OPTIONAL_CONSENT_CATEGORIES } from '../../consent-record/types';
import type { ExplicitChoice } from '../../consent-record/types';
import type { SavePayload } from '../../types';
import type { DecisionAssertion } from '../decision-inputs';

/** The body, without the decision assertion the transport adds. */
export type V1ConsentRecordBody = Omit<
	V1ConsentRecordInput,
	keyof DecisionAssertion
>;

/**
 * Every explicit receipt of a choice dated no later than `givenAt`, in wire
 * form. Receipts are copied, never restamped, so a replay sends the same
 * answer. `necessary` is left out: the backend counts it as `true`.
 */
export const buildV1Answer = function buildV1Answer(
	choice: Readonly<ExplicitChoice>,
	givenAt: number
): V1ConsentAnswer {
	const categories: V1ConsentAnswer['categories'] = {};
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const receipt = choice.categories[category];
		// Last resort, for a receipt re-dated while the device clock was still
		// wrong and corrected afterwards: every other receipt a save carries is
		// dated no later than its givenAt. Sent with a later time it would be
		// refused; dated givenAt it could overtake what another tab recorded
		// since. Left out, the backend keeps what it holds for the category.
		if (receipt === undefined || receipt.confirmedAt > givenAt) {
			continue;
		}
		categories[category] = {
			basis:
				receipt.basis.kind === 'choice-v1'
					? { fingerprint: receipt.basis.fingerprint, kind: 'choice-v1' }
					: {
							kind: 'legacy-v2',
							...(receipt.basis.materialFingerprint !== undefined && {
								materialFingerprint: receipt.basis.materialFingerprint,
							}),
						},
			confirmedAt: receipt.confirmedAt,
			value: receipt.value,
		};
	}
	return { categories };
};

/** Audit metadata for a save, or `undefined` when there is nothing to send. */
const buildMetadata = function buildMetadata(
	payload: SavePayload
): Record<string, unknown> | undefined {
	const metadata: Record<string, unknown> = {};
	if (payload.user?.properties) {
		metadata.userProperties = payload.user.properties;
	}
	if (payload.timeToDecisionMs !== undefined) {
		metadata.timeToDecisionMs = payload.timeToDecisionMs;
	}
	if (payload.experiment) {
		metadata.experiment = { ...payload.experiment };
	}
	return Object.keys(metadata).length > 0 ? metadata : undefined;
};

/**
 * Build the records body of one save.
 *
 * @param payload - The kernel's save payload.
 * @param property - Lowercase host name or app ID the consent belongs to.
 * @returns The body, without the decision assertion.
 */
export const buildV1ConsentRecordBody = function buildV1ConsentRecordBody(
	payload: SavePayload,
	property: string
): V1ConsentRecordBody {
	if (!payload.idempotencyKey) {
		// A key made here would differ on every retry, so the backend would
		// record each retry as a new choice.
		throw new TypeError(
			'Inth transport: a save needs an idempotencyKey. Make one with createIdempotencyKey() when the visitor acts, and send it unchanged on every retry.'
		);
	}
	const givenAt = payload.givenAt ?? payload.confirmed.actionAt;
	const answer = buildV1Answer(payload.choice, givenAt);
	const confirmed = OPTIONAL_CONSENT_CATEGORIES.filter(
		(category) =>
			Object.hasOwn(payload.confirmed.categories, category) &&
			answer.categories[category] !== undefined
	);
	const { user } = payload;
	const body: V1ConsentRecordBody = {
		answer,
		confirmed,
		consentAction: payload.consentAction,
		givenAt,
		idempotencyKey: payload.idempotencyKey,
		property,
		subjectId: payload.subjectId,
	};
	if (user?.externalId) {
		body.externalId = user.externalId;
	}
	if (user?.identityProvider) {
		body.identityProvider = user.identityProvider;
	}
	if (user?.identityToken) {
		body.identityToken = user.identityToken;
	}
	if (payload.model) {
		body.model = payload.model;
	}
	if (payload.uiSource) {
		body.uiSource = payload.uiSource;
	}
	if (payload.policySnapshotToken) {
		body.policySnapshotToken = payload.policySnapshotToken;
	}
	if (payload.tcString) {
		body.tcString = payload.tcString;
		if (payload.addtlConsent) {
			body.addtlConsent = payload.addtlConsent;
		}
	}
	// The same last resort as for a receipt: see buildV1Answer.
	if (
		payload.vendorChoice !== undefined &&
		payload.vendorChoice.confirmedAt <= givenAt
	) {
		body.vendorChoice = {
			confirmedAt: payload.vendorChoice.confirmedAt,
			grants: { ...payload.vendorChoice.grants },
			version: 1,
		};
	}
	const metadata = buildMetadata(payload);
	if (metadata) {
		body.metadata = metadata;
	}
	return body;
};
