import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'vite-plus/test';

import { generateDistributionCss } from '../packages/sdk/shared/generate-distribution-css';

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

test.each(['react', 'nextjs', 'tanstack-start'])(
	'writes wrapper and inline CSS for %s',
	(name) => {
		const workspace = mkdtempSync(join(tmpdir(), 'inth-css-'));
		directories.push(workspace);
		const packageRoot = join(workspace, name);
		mkdirSync(join(packageRoot, 'src/iab'), { recursive: true });
		mkdirSync(join(workspace, 'ui/dist/iab'), { recursive: true });
		writeFileSync(
			join(packageRoot, 'package.json'),
			JSON.stringify({ name: `@inth/${name}` })
		);
		for (const prefix of ['', 'iab/']) {
			writeFileSync(
				join(packageRoot, `src/${prefix}styles.css`),
				`@import '@inth/sdk/ui/${prefix}styles.css';\n`
			);
			writeFileSync(
				join(workspace, `ui/dist/${prefix}styles.tw3.css`),
				'.banner { color: red; }\n'
			);
		}
		generateDistributionCss(packageRoot);
		for (const prefix of ['', 'iab/']) {
			expect(
				readFileSync(join(packageRoot, `dist/${prefix}styles.css`), 'utf8')
			).toBe(`@import '@inth/sdk/ui/${prefix}styles.css';\n`);
			const inlined = readFileSync(
				join(packageRoot, `dist/${prefix}styles.tw3.css`),
				'utf8'
			);
			expect(inlined).toContain(`@inth/${name} - Tailwind 3-compatible`);
			expect(inlined).toContain('.banner { color: red; }');
			expect(inlined).not.toContain('@import');
		}
	}
);
