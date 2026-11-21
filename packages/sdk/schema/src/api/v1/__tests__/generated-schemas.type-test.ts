import type * as v from 'valibot';

import type * as schemas from '../generated/schemas';
import type { components, operations } from '../generated/types';
import type { ExpectNone, WireDiff } from './wire-diff';

/*
 * The generated Valibot schemas against the types openapi-typescript
 * generates from the same document. Two generators read the document apart,
 * so a mismatch is a bug in one of them, most likely ours
 * (`scripts/openapi-to-valibot.ts`).
 *
 * Each schema is compared by its input: a property with a default is
 * optional there, as the document's type has it.
 *
 * A component that refers to itself is typed with the document's type, since
 * TypeScript cannot infer a recursive schema. For it, TypeScript checks only
 * that the schema's output fits the type: a branch missing from the schema
 * goes unnoticed here, and the runtime tests cover it.
 */

type Schemas = typeof schemas;
type In<Name extends string> = Name extends keyof Schemas
	? Schemas[Name] extends v.GenericSchema
		? v.InferInput<Schemas[Name]>
		: never
	: never;

type ComponentDiffs = {
	[Name in keyof components['schemas'] & string]: WireDiff<
		In<`${Uncapitalize<Name>}Schema`>,
		components['schemas'][Name],
		Name
	>;
}[keyof components['schemas'] & string];

/** `Part` of `Id`, or `never` for an operation without one. */
type Generated<
	Id extends string,
	Part extends string,
> = `${Id}${Part}Schema` extends keyof Schemas
	? In<`${Id}${Part}Schema`>
	: never;

type Json<T> = T extends { content: { 'application/json': infer Body } }
	? Body
	: never;

/**
 * The JSON body of a 2xx response, which the generator allows one of. It
 * refuses a range such as `2XX`.
 */
type SuccessBody<Responses> = {
	[Status in keyof Responses]: `${Status & number}` extends `2${string}`
		? Json<Responses[Status]>
		: never;
}[keyof Responses];

interface Parts<Id extends keyof operations> {
	Body: Json<NonNullable<operations[Id]['requestBody']>>;
	Path: NonNullable<operations[Id]['parameters']['path']>;
	Query: NonNullable<operations[Id]['parameters']['query']>;
	Response: SuccessBody<operations[Id]['responses']>;
}

type OperationDiffs = {
	[Id in keyof operations & string]: {
		[Part in keyof Parts<Id> & string]: WireDiff<
			Generated<Id, Part>,
			Parts<Id>[Part],
			`${Id} ${Part}`
		>;
	}[keyof Parts<Id> & string];
}[keyof operations & string];

/** A component or operation part whose schema and type disagree. */
export type Mismatches = ExpectNone<ComponentDiffs | OperationDiffs>;
