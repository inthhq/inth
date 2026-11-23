/**
 * `/v1/subjects/*` schemas: link a device subject to a person, and sign an
 * identity token for one.
 *
 * Without a secret key a link needs an `identityToken` that verifies for
 * `externalId`. There is no route for a browser to read a subject.
 *
 * Each one is the schema generated from the backend's OpenAPI document, with
 * the SDK's subject ID rules in place of the document's plain string and
 * UUID.
 *
 * @packageDocumentation
 */

import * as v from 'valibot';

import {
	v1CanonicalSubjectIdSchema,
	v1EffectiveOptOutSchema,
	v1SubjectIdSchema,
} from './v1-common.model';
import type { V1EffectiveOptOut } from './v1-common.model';
import {
	identityTokenRequestSchema,
	identityTokenResponseSchema,
	postV1SubjectsByIdLinkPathSchema,
	subjectLinkRequestSchema,
	subjectLinkResponseSchema,
} from './generated/schemas';
import { jsonObject } from './json-schema';

export const v1SubjectLinkParamsSchema = jsonObject(
	v.object({
		...postV1SubjectsByIdLinkPathSchema.entries,
		id: v1SubjectIdSchema,
	})
);

export const v1SubjectLinkInputSchema = subjectLinkRequestSchema;

export const v1SubjectLinkOutputSchema = jsonObject(
	v.object({
		...subjectLinkResponseSchema.entries,
		optOut: v.optional(v1EffectiveOptOutSchema),
		subjectId: v1CanonicalSubjectIdSchema,
	})
);

// POST /v1/subjects/identity-tokens (secret key)

export const v1SubjectIdentityTokenInputSchema = identityTokenRequestSchema;

export const v1SubjectIdentityTokenOutputSchema = identityTokenResponseSchema;

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
export type V1SubjectLinkOutput = Omit<
	v.InferOutput<typeof v1SubjectLinkOutputSchema>,
	'optOut'
> & {
	optOut?: V1EffectiveOptOut;
};
