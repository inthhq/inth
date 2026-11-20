import type { ExpectNone, WireDiff } from './wire-diff';

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
type Expect<T extends true> = T;

interface Receipt {
	basis: { kind: 'choice-v1'; fingerprint: string } | { kind: 'legacy-v2' };
	confirmedAt: number;
	value: boolean;
}

export type Cases = [
	ExpectNone<WireDiff<Receipt, Receipt, 'same'>>,
	Expect<
		Equal<
			WireDiff<{ name: string }, { title: string }, 'renamed'>,
			'renamed.name: only in SDK' | 'renamed.title: only in document'
		>
	>,
	Expect<
		Equal<
			WireDiff<{ a?: string }, { a: string }, 'optional'>,
			'optional.a: optional in SDK, required in document'
		>
	>,
	Expect<
		Equal<
			WireDiff<{ a: string | null }, { a: string }, 'nullable'>,
			'nullable.a: nullable in SDK only'
		>
	>,
	Expect<
		Equal<
			WireDiff<{ a: string }, { a: number | null }, 'nullable and typed'>,
			| 'nullable and typed.a: nullable in document only'
			| 'nullable and typed.a: types differ'
		>
	>,
	Expect<
		Equal<
			WireDiff<{ a: string[] }, { a: number[] }, 'items'>,
			'items.a[]: types differ'
		>
	>,
	Expect<
		Equal<
			WireDiff<'a' | 'b', 'a' | 'b' | 'c', 'enum'>,
			'enum: a variant only in document'
		>
	>,
	Expect<
		Equal<
			WireDiff<
				Receipt,
				Omit<Receipt, 'basis'> & {
					basis:
						| { kind: 'choice-v1'; fingerprint: string }
						| { kind: 'legacy-v2'; materialFingerprint?: string };
				},
				'variant'
			>,
			'variant.basis.materialFingerprint: only in document'
		>
	>,
	Expect<
		Equal<
			WireDiff<
				{ [key: string]: unknown; known: string },
				{ known: string },
				'loose'
			>,
			never
		>
	>,
	Expect<
		Equal<
			WireDiff<Record<string, number>, { a: number }, 'record'>,
			'record: record of number in SDK only'
		>
	>,
	Expect<
		Equal<
			WireDiff<{ a: string }, Record<string, number>, 'record values'>,
			| 'record values: record of number in document only'
			| 'record values.a: types differ'
		>
	>,
	Expect<
		Equal<
			WireDiff<{ a: string }, Record<string, unknown>, 'open record'>,
			'open record: record of unknown in document only'
		>
	>,
];
