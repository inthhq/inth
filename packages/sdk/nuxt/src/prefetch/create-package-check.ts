import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Whether a file belongs to an SDK package (`@inth/*` other than the CLI), read from
 * the nearest `package.json` that names a package.
 * @internal
 */
export const createPackageCheck = function createPackageCheck(): (
	file: string
) => boolean {
	const byDirectory = new Map<string, boolean>();
	const check = (directory: string): boolean => {
		const cached = byDirectory.get(directory);
		if (cached !== undefined) {
			return cached;
		}
		let result = false;
		const manifest = join(directory, 'package.json');
		const parent = dirname(directory);
		let name: unknown;
		if (existsSync(manifest)) {
			try {
				({ name } = JSON.parse(readFileSync(manifest, 'utf8')) as {
					name?: unknown;
				});
			} catch {
				name = undefined;
			}
		}
		if (typeof name === 'string') {
			result = name.startsWith('@inth/') && name !== '@inth/cli';
		} else if (parent !== directory) {
			result = check(parent);
		}
		byDirectory.set(directory, result);
		return result;
	};
	return (file) => check(dirname(file));
};
