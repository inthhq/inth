/**
 * A type-level diff of two wire shapes, for comparing the `/v1` schemas with
 * the types generated from the backend's OpenAPI document.
 *
 * `WireDiff<Sdk, Document, Path>` is a union of strings, one per field where
 * the two differ, such as `"records body.model: only in SDK"`. It is `never`
 * when they match. Objects are compared key by key, with optionality;
 * arrays by their items; records by their values; `null` on its own; two
 * unions member by member; and anything else by assignability both ways.
 * Below `MaxDepth` levels, as in a recursive type, the rest of the shape is
 * compared by assignability alone.
 */

type MaxDepth = 12;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type IsUnion<T, All = T> = T extends unknown
	? [All] extends [T]
		? false
		: true
	: never;

type IsObject<T> = [T] extends [readonly unknown[]]
	? false
	: [T] extends [object]
		? true
		: false;

type Differs<A, B, Path extends string> =
	Same<A, B> extends true ? never : `${Path}: types differ`;

/** The members of `Options` that `Item` is assignable to and from. */
type MatchIn<Item, Options> = Options extends unknown
	? Same<Item, Options> extends true
		? Options
		: never
	: never;

/**
 * Each member of one union against the member of the other it matches, so
 * an optional field added to one variant is still found.
 */
type UnionDiff<A, B, Path extends string, Depth extends unknown[]> =
	| (A extends unknown
			? [MatchIn<A, B>] extends [never]
				? `${Path}: a variant only in SDK`
				: true extends IsUnion<MatchIn<A, B>>
					? Differs<A, MatchIn<A, B>, Path>
					: Diff<A, MatchIn<A, B>, Path, Depth>
			: never)
	| (B extends unknown
			? [MatchIn<B, A>] extends [never]
				? `${Path}: a variant only in document`
				: never
			: never);

type NullDiff<A, B, Path extends string, Depth extends unknown[]> = [
	null,
] extends [A]
	? [null] extends [B]
		? Diff<Exclude<A, null>, Exclude<B, null>, Path, Depth>
		: `${Path}: nullable in SDK only`
	: [null] extends [B]
		? `${Path}: nullable in document only`
		: Diff<A, B, Path, Depth>;

type OptionalKeys<T> = {
	[K in keyof T]-?: object extends Pick<T, K> ? K : never;
}[keyof T];

type KeyDiff<
	A,
	B,
	K extends keyof A & keyof B & string,
	Path extends string,
	Depth extends unknown[],
> =
	K extends OptionalKeys<A>
		? K extends OptionalKeys<B>
			? NullDiff<
					Exclude<A[K], undefined>,
					Exclude<B[K], undefined>,
					`${Path}.${K}`,
					Depth
				>
			: `${Path}.${K}: optional in SDK, required in document`
		: K extends OptionalKeys<B>
			? `${Path}.${K}: required in SDK, optional in document`
			: NullDiff<A[K], B[K], `${Path}.${K}`, Depth>;

/** `T` without its index signatures, as a loose object's known keys. */
type Known<T> = {
	[
		K in keyof T as string extends K ? never : number extends K ? never : K
	]: T[K];
};

/** Whether `T` is a record: an index signature and no known keys. */
type IsRecord<T> = string extends keyof T
	? [keyof Known<T>] extends [never]
		? true
		: false
	: false;

type KnownDiff<A, B, Path extends string, Depth extends unknown[]> =
	| {
			[K in Exclude<keyof A, keyof B> & string]: `${Path}.${K}: only in SDK`;
	  }[Exclude<keyof A, keyof B> & string]
	| {
			[
				K in Exclude<keyof B, keyof A> & string
			]: `${Path}.${K}: only in document`;
	  }[Exclude<keyof B, keyof A> & string]
	| {
			[K in keyof A & keyof B & string]: KeyDiff<A, B, K, Path, Depth>;
	  }[keyof A & keyof B & string];

/**
 * Records compare by their values. An object with known keys compares key
 * by key; an index signature beside them (a valibot loose object) only
 * says that more keys are accepted, which the document does by default.
 */
type ObjectDiff<A, B, Path extends string, Depth extends unknown[]> =
	IsRecord<A> extends true
		? IsRecord<B> extends true
			? Diff<A[string & keyof A], B[string & keyof B], `${Path}.*`, Depth>
			: `${Path}: record in SDK only`
		: IsRecord<B> extends true
			? `${Path}: record in document only`
			: KnownDiff<Known<A>, Known<B>, Path, Depth>;

type Diff<
	A,
	B,
	Path extends string,
	Depth extends unknown[],
> = Depth['length'] extends MaxDepth
	? Differs<A, B, Path>
	: Step<A, B, Path, [...Depth, unknown]>;

type Step<A, B, Path extends string, Depth extends unknown[]> = unknown extends
	| A
	| B
	? Differs<A, B, Path>
	: [null] extends [A | B]
		? NullDiff<A, B, Path, Depth>
		: [IsUnion<A>, IsUnion<B>] extends [true, true]
			? UnionDiff<A, B, Path, Depth>
			: true extends IsUnion<A> | IsUnion<B>
				? Differs<A, B, Path>
				: [A, B] extends [readonly (infer ItemA)[], readonly (infer ItemB)[]]
					? Diff<ItemA, ItemB, `${Path}[]`, Depth>
					: [IsObject<A>, IsObject<B>] extends [true, true]
						? ObjectDiff<A, B, Path, Depth>
						: Differs<A, B, Path>;

export type WireDiff<A, B, Path extends string> = Diff<A, B, Path, []>;

/** Fails to compile unless `T` is `never`, and names what `T` holds. */
export type ExpectNone<T extends never> = T;
