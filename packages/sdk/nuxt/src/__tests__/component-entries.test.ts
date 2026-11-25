import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'vite-plus/test';

const vueManifest = JSON.parse(
	readFileSync(join(__dirname, '../../../vue/package.json'), 'utf8')
) as { exports: Record<string, unknown> };

test('every @inth/vue component file has an @inth/nuxt/components entry', () => {
	const vueComponents = Object.keys(vueManifest.exports)
		.flatMap(
			(key) =>
				/^\.\/runtime\/components\/(?<name>.+)\.vue$/u.exec(key)?.groups
					?.name ?? []
		)
		.sort();
	const entries = readdirSync(join(__dirname, '../components'))
		.map((file) => file.replace(/\.ts$/u, ''))
		.sort();
	expect(entries).toEqual(vueComponents);
	for (const name of entries) {
		expect(
			readFileSync(join(__dirname, `../components/${name}.ts`), 'utf8')
		).toContain(`'@inth/vue/runtime/components/${name}.vue'`);
	}
});
