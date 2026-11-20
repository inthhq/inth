/**
 * `/v1/subjects/*` schemas: link a device subject to a person, and sign an
 * identity token for one.
 *
 * Without a secret key a link needs an `identityToken` that verifies for
 * `externalId`. There is no route for a browser to read a subject.
 *
 * @packageDocumentation
 */

import * as v from 'valibot';

import {
	v1CanonicalSubjectIdSchema,
	v1ExternalIdSchema,
	v1IdentityProviderSchema,
	v1IdentityTokenSchema,
	v1SubjectIdSchema,
} from './common';

export const v1SubjectLinkParamsSchema = v.object({
	id: v1SubjectIdSchema,
});

export const v1SubjectLinkInputSchema = v.object({
	externalId: v1ExternalIdSchema,
	identityProvider: v.optional(v1IdentityProviderSchema),
	identityToken: v.optional(v1IdentityTokenSchema),
});

export const v1SubjectLinkOutputSchema = v.object({
	externalId: v1ExternalIdSchema,
	subjectId: v1CanonicalSubjectIdSchema,
	verifiedBy: v.picklist(['secret_key', 'identity_token']),
});

// POST /v1/subjects/identity-tokens (secret key)

export const v1SubjectIdentityTokenInputSchema = v.object({
	externalId: v1ExternalIdSchema,
	identityProvider: v.optional(v1IdentityProviderSchema),
});

export const v1SubjectIdentityTokenOutputSchema = v.object({
	expiresAt: v.pipe(v.string(), v.isoTimestamp()),
	token: v1IdentityTokenSchema,
});

export type V1SubjectIdentityTokenInput = v.InferOutput<
	typeof v1SubjectIdentityTokenInputSchema
>;
export type V1SubjectIdentityTokenOutput = v.InferOutput<
	typeof v1SubjectIdentityTokenOutputSchema
>;
export type V1SubjectLinkParams = v.InferOutput<
	typeof v1SubjectLinkParamsSchema
>;
export type V1SubjectLinkInput = v.InferOutput<typeof v1SubjectLinkInputSchema>;
export type V1SubjectLinkOutput = v.InferOutput<
	typeof v1SubjectLinkOutputSchema
>;
