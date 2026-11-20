import type {
	V1ConsentAnswer,
	V1ConsentRecordInput,
	VendorChoiceWire,
} from '@inth/sdk-schema/types';

import { OPTIONAL_CONSENT_CATEGORIES } from '../../consent-record/types';
import type { ExplicitChoice } from '../../consent-record/types';
import { createIdempotencyKey } from '../../libs/subject-uuid';
import type { SavePayload } from '../../types';
import type { DecisionAssertion } from '../decision-inputs';

/** The body, without the decision assertion the transport adds. */
export type V1ConsentRecordBody = Omit<
	V1ConsentRecordInput,
	keyof DecisionAssertion
>;

/**
 * Every explicit receipt of a choice, in wire form. Receipts are copied,
 * never restamped, so a replay sends the same answer. `necessary` is left
 * out: the backend counts it as `true`.
 */
export const buildV1Answer = function buildV1Answer(
	choice: Readonly<ExplicitChoice>
): V1ConsentAnswer {
	const categories: V1ConsentAnswer['categories'] = {};
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const receipt = choice.categories[category];
		if (receipt === undefined) {
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

const buildVendorChoice = function buildVendorChoice(
	vendorChoice: NonNullable<SavePayload['vendorChoice']>
): VendorChoiceWire {
	return {
		confirmedAt: vendorChoice.confirmedAt,
		grants: { ...vendorChoice.grants },
		version: 1,
	};
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
	const answer = buildV1Answer(payload.choice);
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
		givenAt: payload.confirmed.actionAt,
		idempotencyKey: payload.idempotencyKey ?? createIdempotencyKey(),
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
	if (payload.vendorChoice !== undefined) {
		body.vendorChoice = buildVendorChoice(payload.vendorChoice);
	}
	const metadata = buildMetadata(payload);
	if (metadata) {
		body.metadata = metadata;
	}
	return body;
};
