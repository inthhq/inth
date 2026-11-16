/**
 * Finishes `dist/schematics` after `tsc`: copies the collection and schema
 * JSON, and marks the folder CommonJS. The package is `"type": "module"`,
 * and the Angular CLI loads schematic factories with `require`.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
const target = join(source, '..', 'dist', 'schematics');

for (const file of ['collection.json', 'ng-add/schema.json']) {
	mkdirSync(dirname(join(target, file)), { recursive: true });
	copyFileSync(join(source, file), join(target, file));
}
writeFileSync(
	join(target, 'package.json'),
	`${JSON.stringify({ type: 'commonjs' }, null, '\t')}\n`
);
