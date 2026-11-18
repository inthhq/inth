/**
 * Where repository tooling loads SDK packages from when it runs before the
 * package builds: the source file behind a public or private specifier.
 */
import { fileURLToPath } from 'node:url';

import { toPublicSpecifier } from '../packages/sdk/shared/sdk-parts';

const SOURCES: Record<string, string> = {
	'@inth/sdk/schema': 'schema/src/index.ts',
	'@inth/sdk/schema/types': 'schema/src/types.ts',
	'@inth/sdk/translations': 'translations/src/index.ts',
};

const LANGUAGE_ENTRY = /^@inth\/sdk\/translations\/(?<language>[a-z]{2})$/u;

/**
 * The source file for an SDK specifier, such as `@inth/sdk-schema/types`.
 *
 * @param specifier - A public or private SDK specifier.
 * @returns An absolute path, or `undefined` for anything else.
 */
export const sdkSource = function sdkSource(
	specifier: string
): string | undefined {
	const name = toPublicSpecifier(specifier);
	const language = LANGUAGE_ENTRY.exec(name)?.groups?.language;
	const path = language
		? `translations/src/translations/${language}.ts`
		: SOURCES[name];
	return path
		? fileURLToPath(new URL(`../packages/sdk/${path}`, import.meta.url))
		: undefined;
};
