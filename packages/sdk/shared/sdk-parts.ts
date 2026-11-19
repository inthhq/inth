/**
 * The private packages `@inth/sdk` publishes, and how their names map to
 * public specifiers. The assembler, the framework test resolvers and the
 * build helpers all read it from here, so a new part is added once.
 */

/** Folders under `packages/sdk` that `@inth/sdk` publishes. */
export const PARTS = [
	'browser',
	'core',
	'dev-tools',
	'iab',
	'schema',
	'translations',
	'ui',
] as const;

export type Part = (typeof PARTS)[number];

const PART_PATTERN = PARTS.join('|');

/** A private specifier anywhere in a text, such as `@inth/sdk-core/runtime`. */
export const PRIVATE_SPECIFIER = new RegExp(
	`@inth\\/sdk-(?<part>${PART_PATTERN})(?![\\w-])(?<rest>(?:\\/[\\w.*-]+)*)`,
	'gu'
);

export const isPrivateSdkName = (id: string): boolean =>
	new RegExp(`^@inth\\/sdk-(?:${PART_PATTERN})(?:\\/|$)`, 'u').test(id);

/**
 * Entries two parts share, published as one module that re-exports both:
 * the public subpath, then each part's export key.
 */
export const MERGED_ENTRIES: Record<string, readonly [Part, string][]> = {
	'./devtools': [
		['dev-tools', '.'],
		['browser', './devtools'],
	],
};

export const toPublicSubpath = function toPublicSubpath(
	part: Part,
	key: string
): string {
	for (const [subpath, sources] of Object.entries(MERGED_ENTRIES)) {
		if (sources.some(([p, k]) => p === part && k === key)) {
			return subpath;
		}
	}
	if (part === 'browser') {
		return key === './iab' ? './iab-client' : key;
	}
	if (part === 'core') {
		return key === '.' ? './engine' : key;
	}
	return key === '.' ? `./${part}` : `./${part}${key.slice(1)}`;
};

/** The public specifier for a private one, such as `@inth/sdk-core/x`. */
export const toPublicSpecifier = function toPublicSpecifier(
	text: string
): string {
	return text.replace(PRIVATE_SPECIFIER, (_match, part: Part, rest: string) => {
		const subpath = toPublicSubpath(part, rest ? `.${rest}` : '.');
		return subpath === '.' ? '@inth/sdk' : `@inth/sdk${subpath.slice(1)}`;
	});
};
