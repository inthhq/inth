/**
 * Wire helpers the protocol fixture generator still needs from the web SDK's
 * retired subject route. The generator turns the subject body into the `/v1`
 * records body the native cores send, and reads stored `sub_` subject IDs.
 */
import { OPTIONAL_CONSENT_CATEGORIES } from '@inth/sdk/engine';
import type { OptionalConsentCategory, SavePayload } from '@inth/sdk/engine';
import { POLICY_CONTRACT_VERSION } from '@inth/sdk/schema/types';
import type {
	SubjectChoiceWire,
	VendorChoiceWire,
} from '@inth/sdk/schema/types';

/**
 * The policy contract version this build reads. Read from the schema, so a
 * fixture never pins a contract the code it was generated from moved past.
 */
export const POLICY_CONTRACT_HEADER_VALUE = String(POLICY_CONTRACT_VERSION);

// Base58 without 0, O, I and l, as the backend encodes subject IDs.
const BASE58_ALPHABET =
	'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Whether `id` is a `sub_` ID the backend's `subjectIdSchema` accepts. */
export const isValidSubjectId = function isValidSubjectId(id: string): boolean {
	if (!id.startsWith('sub_')) {
		return false;
	}
	const encoded = id.slice(4);
	if (encoded.length === 0) {
		return false;
	}
	for (const char of encoded) {
		if (!BASE58_ALPHABET.includes(char)) {
			return false;
		}
	}
	return true;
};

export interface SubjectPostBody {
	subjectId: string;
	externalSubjectId?: string;
	identityProvider?: string;
	identityToken?: string;
	domain: string;
	type: 'cookie_banner';
	preferences: Record<string, boolean>;
	givenAt: number;
	choice?: SubjectChoiceWire;
	model?: NonNullable<SavePayload['model']>;
	uiSource?: NonNullable<SavePayload['uiSource']>;
	consentAction: SavePayload['consentAction'];
	policySnapshotToken?: string;
	tcString?: string;
	addtlConsent?: string;
	vendorChoice?: VendorChoiceWire;
	metadata?: Record<string, unknown>;
}

const buildMetadata = function buildMetadata(
	payload: SavePayload
): SubjectPostBody['metadata'] {
	const metadata: NonNullable<SubjectPostBody['metadata']> = {};
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
 * Receipts for exactly the categories the act confirmed. An act that
 * confirmed none sends an empty receipt: a body without `choice` reads as a
 * 2.x save, and the backend would stamp a receipt for every preference.
 */
const buildConfirmedChoiceWire = function buildConfirmedChoiceWire(
	payload: Pick<SavePayload, 'choice' | 'confirmed'>
): SubjectChoiceWire | undefined {
	const { choice, confirmed } = payload;
	if (!choice || !confirmed) {
		return undefined;
	}
	const categories: SubjectChoiceWire['categories'] = {};
	for (const key of Object.keys(confirmed.categories)) {
		const receipt = choice.categories[key as OptionalConsentCategory];
		if (receipt === undefined) {
			continue;
		}
		categories[key as OptionalConsentCategory] = {
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
	return { categories, version: 3 };
};

const explicitPreferences = function explicitPreferences(
	choice: SavePayload['choice']
): Record<string, boolean> {
	const preferences: Record<string, boolean> = { necessary: true };
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const receipt = choice.categories[category];
		if (receipt !== undefined) {
			preferences[category] = receipt.value;
		}
	}
	return preferences;
};

/** The `POST /subjects` body a native core sends for a kernel save. */
export const buildSubjectPostBody = function buildSubjectPostBody(
	payload: SavePayload,
	options: { domain: string }
): SubjectPostBody {
	const choice = buildConfirmedChoiceWire(payload);
	return {
		consentAction: payload.consentAction,
		domain: options.domain,
		externalSubjectId: payload.user?.externalId,
		givenAt: payload.confirmed.actionAt,
		identityProvider: payload.user?.identityProvider,
		identityToken: payload.user?.identityToken,
		metadata: buildMetadata(payload),
		model: payload.model ?? undefined,
		policySnapshotToken: payload.policySnapshotToken ?? undefined,
		preferences: explicitPreferences(payload.choice),
		subjectId: payload.subjectId,
		tcString: payload.tcString ?? undefined,
		type: 'cookie_banner',
		uiSource: payload.uiSource ?? undefined,
		...(choice !== undefined && { choice }),
		...(payload.tcString &&
			payload.addtlConsent && { addtlConsent: payload.addtlConsent }),
		...(payload.vendorChoice !== undefined && {
			vendorChoice: {
				confirmedAt: payload.vendorChoice.confirmedAt,
				grants: { ...payload.vendorChoice.grants },
				version: 1 as const,
			},
		}),
	};
};
