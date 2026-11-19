/**
 * GET /subjects schemas - List subjects by externalId (requires API key).
 *
 * @packageDocumentation
 */

import * as v from 'valibot';

import { consentItemSchema } from './get';

export const listSubjectsQuerySchema = v.object({
	externalId: v.pipe(
		v.string(),
		v.description('External user ID from your authentication system.'),
		v.examples(['user_123'])
	),
});

export const subjectItemSchema = v.object({
	consents: v.array(consentItemSchema),
	createdAt: v.date(),
	externalId: v.string(),
	id: v.string(),
});

export const listSubjectsOutputSchema = v.object({
	subjects: v.array(subjectItemSchema),
});

export const listSubjectsErrorSchemas = {
	externalIdRequired: v.object({
		message: v.string(),
	}),
	inputValidationFailed: v.object({
		fieldErrors: v.record(v.string(), v.array(v.string())),

		formErrors: v.array(v.string()),
	}),
	unauthorized: v.object({
		message: v.string(),
	}),
};

export type ListSubjectsQuery = v.InferOutput<typeof listSubjectsQuerySchema>;
export type ListSubjectsOutput = v.InferOutput<typeof listSubjectsOutputSchema>;
export type SubjectItem = v.InferOutput<typeof subjectItemSchema>;
