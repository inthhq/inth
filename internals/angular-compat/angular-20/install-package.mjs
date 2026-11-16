/**
 * Installs the built `@c15t/angular` into this app as npm would: its
 * `package.json` and `dist/`, in a directory of its own.
 *
 * The workspace link points at `packages/angular`, whose `node_modules`
 * holds the Angular 22 it builds with. Imports from the linked build would
 * resolve that Angular instead of this app's 20, which no installed copy
 * can do. The package's own dependencies are this app's dependencies too,
 * so they resolve here as they would from an install.
 */
import {
	cpSync,
	lstatSync,
	mkdirSync,
	realpathSync,
	rmSync,
	unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(
	new URL('../../../packages/angular/', import.meta.url)
);
// No trailing slash: `lstat` on `link/` follows the workspace symlink to
// `packages/angular`, and removing that path recursively would delete the
// package source.
const target = fileURLToPath(
	new URL('node_modules/@c15t/angular', import.meta.url)
);

let stats;
try {
	stats = lstatSync(target);
} catch {
	// Nothing installed yet.
}
if (stats?.isSymbolicLink()) {
	unlinkSync(target);
} else if (stats) {
	if (realpathSync(target) !== target) {
		throw new Error(`Refusing to remove ${target}: it resolves elsewhere.`);
	}
	rmSync(target, { force: true, recursive: true });
}
mkdirSync(target, { recursive: true });
cpSync(join(source, 'package.json'), join(target, 'package.json'));
cpSync(join(source, 'dist'), join(target, 'dist'), { recursive: true });
