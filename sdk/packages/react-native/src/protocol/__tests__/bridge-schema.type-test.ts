/**
 * Each bridge payload type against `BRIDGE_PAYLOADS`, key by key.
 *
 * The native tests hold Swift and Kotlin to `native/protocol/bridge/payloads.json`,
 * which is generated from that table. This file holds the TypeScript types to the
 * same table, so a key renamed in a protocol type alone is a compile error here,
 * and a key renamed in the table alone fails the native tests. Vitest does not
 * check types, so this runs through `tsc -p tsconfig.type-tests.json`, which the
 * package's `check-types` script calls.
 *
 * A failing line names the payload. Hover the `Matches<...>` result to see which
 * keys are missing, extra or disagree.
 */

import { expectTypeOf } from 'vitest';

import type {
	ConsentPresenterOutcome,
	ConsentPresenterSession,
} from '../../native/presenter';
import type { BootstrapPayload } from '../bootstrap';
import type { BRIDGE_PAYLOADS } from '../bridge-schema';
import type { CommitIntent, CommitResult } from '../commit';
import type { NativeInitializedEvent, NativeSnapshotEvent } from '../events';
import type { NativeOverridesInput } from '../overrides';
import type { ConsentSnapshot, NativeSnapshotError } from '../snapshot';
import type {
	TrackingAuthorizationPayload,
	TrackingRequestPayload,
} from '../tracking';

type Schema = typeof BRIDGE_PAYLOADS;

/** Every key of every member of a union. */
type KeysOf<Type> = Type extends unknown ? keyof Type : never;

/** The value type at a key, across the union members that have it. */
type ValueAt<Type, Key extends PropertyKey> = Type extends unknown
	? Key extends keyof Type
		? Type[Key]
		: never
	: never;

/** `true` only when every union member has the key and it is not optional. */
type RequiredEverywhere<Type, Key extends PropertyKey> = [
	Type extends unknown
		? Key extends keyof Type
			? Record<never, never> extends Pick<Type, Key>
				? false
				: true
			: false
		: never,
] extends [true]
	? true
	: false;

type Same<Left, Right> = [Left] extends [Right]
	? [Right] extends [Left]
		? true
		: false
	: false;

type SpecOptional<Spec> = Spec extends `${string}?${string}`
	? true
	: Spec extends { readonly optional: true }
		? true
		: false;

type SpecNullable<Spec> = Spec extends `${string} | null`
	? true
	: Spec extends { readonly nullable: true }
		? true
		: false;

type SpecKind<Spec> = Spec extends `${infer Kind}?${string}`
	? Kind
	: Spec extends `${infer Kind} | null`
		? Kind
		: Spec extends string
			? Spec
			: Spec extends { readonly enum: readonly string[] }
				? 'string'
				: 'object';

type KindMatches<Value, Kind> = Kind extends 'string'
	? [Value] extends [string]
		? true
		: false
	: Kind extends 'number'
		? [Value] extends [number]
			? true
			: false
		: Kind extends 'boolean'
			? [Value] extends [boolean]
				? true
				: false
			: Kind extends 'array'
				? [Value] extends [readonly unknown[]]
					? true
					: false
				: [Value] extends [readonly unknown[]]
					? false
					: [Value] extends [object]
						? true
						: false;

type FieldProblem<Type, Key extends PropertyKey, Spec> =
	Same<
		SpecOptional<Spec>,
		RequiredEverywhere<Type, Key> extends true ? false : true
	> extends false
		? 'optionality differs'
		: Same<
					SpecNullable<Spec>,
					null extends ValueAt<Type, Key> ? true : false
			  > extends false
			? 'nullability differs'
			: KindMatches<
						Exclude<ValueAt<Type, Key>, null | undefined>,
						SpecKind<Spec>
				  > extends false
				? 'value kind differs'
				: Spec extends { readonly enum: readonly (infer Value)[] }
					? Same<
							Exclude<ValueAt<Type, Key>, null | undefined>,
							Value
						> extends true
						? never
						: 'enum values differ'
					: Spec extends { readonly fields: infer Nested }
						? keyof Nested extends never
							? never
							: Matches<
										Exclude<ValueAt<Type, Key>, null | undefined>,
										Nested
								  > extends true
								? never
								: 'nested keys differ'
						: never;

/**
 * `true` when `Type` and the table agree; otherwise an object naming the keys
 * that are missing from the type, missing from the table, or that disagree.
 */
type Matches<Type, Fields> = [
	Exclude<KeysOf<Type>, keyof Fields>,
	Exclude<keyof Fields, KeysOf<Type>>,
	{
		[Key in keyof Fields]: FieldProblem<Type, Key, Fields[Key]> extends never
			? never
			: Key;
	}[keyof Fields],
] extends [never, never, never]
	? true
	: {
			readonly onlyInType: Exclude<KeysOf<Type>, keyof Fields>;
			readonly onlyInTable: Exclude<keyof Fields, KeysOf<Type>>;
			readonly disagree: {
				[Key in keyof Fields]: FieldProblem<
					Type,
					Key,
					Fields[Key]
				> extends never
					? never
					: Key;
			}[keyof Fields];
		};

expectTypeOf<
	Matches<BootstrapPayload, Schema['bootstrap']>
>().toEqualTypeOf<true>();
expectTypeOf<
	Matches<CommitIntent, Schema['commitIntent']>
>().toEqualTypeOf<true>();
expectTypeOf<
	Matches<CommitResult, Schema['commitResult']>
>().toEqualTypeOf<true>();
expectTypeOf<
	Matches<NativeSnapshotError, Schema['errorEvent']>
>().toEqualTypeOf<true>();
expectTypeOf<
	Matches<NativeInitializedEvent, Schema['initializedEvent']>
>().toEqualTypeOf<true>();
expectTypeOf<
	Matches<NativeOverridesInput, Schema['overridesInput']>
>().toEqualTypeOf<true>();
expectTypeOf<
	Matches<ConsentPresenterOutcome, Schema['presenterOutcome']>
>().toEqualTypeOf<true>();
expectTypeOf<
	Matches<ConsentPresenterSession, Schema['presenterSession']>
>().toEqualTypeOf<true>();
expectTypeOf<
	Matches<ConsentSnapshot, Schema['snapshot']>
>().toEqualTypeOf<true>();
expectTypeOf<
	Matches<NativeSnapshotEvent, Schema['snapshotEvent']>
>().toEqualTypeOf<true>();
expectTypeOf<
	Matches<TrackingAuthorizationPayload, Schema['trackingAuthorization']>
>().toEqualTypeOf<true>();
expectTypeOf<
	Matches<TrackingRequestPayload, Schema['trackingRequest']>
>().toEqualTypeOf<true>();

// The checker itself: a field the table calls an object must reject an array, or a
// protocol type that turned `restrictions` or `iab` into a list would still match.
expectTypeOf<
	Matches<
		{ readonly restrictions: readonly string[] },
		{ readonly restrictions: 'object' }
	>
>().not.toEqualTypeOf<true>();
expectTypeOf<
	Matches<
		{ readonly restrictions: Readonly<Record<string, string>> },
		{ readonly restrictions: 'object' }
	>
>().toEqualTypeOf<true>();
