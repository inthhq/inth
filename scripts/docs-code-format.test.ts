import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vite-plus/test';

import { formatDocsCode, formatMdxFences } from './docs-code-format';
import { formatDocsFiles } from './format-docs-code';

const root = fileURLToPath(new URL('..', import.meta.url));

describe('formatDocsCode', () => {
	test('keeps a JSX tag that fits on one line', async () => {
		const code = [
			'export const Consent = () => (',
			'  <InthProvider',
			'    state={state}',
			'    config={config}',
			'  >',
			'    {children}',
			'  </InthProvider>',
			');',
		].join('\n');
		expect(await formatDocsCode('tsx', code)).toBe(
			[
				'export const Consent = () => (',
				'\t<InthProvider state={state} config={config}>',
				'\t\t{children}',
				'\t</InthProvider>',
				');',
			].join('\n')
		);
	});

	test('collapses an object that fits on one line', async () => {
		expect(
			await formatDocsCode(
				'ts',
				"const mode = hosted({\n\tprojectUrl: 'https://your-project.inth.app',\n});"
			)
		).toBe(
			"const mode = hosted({ projectUrl: 'https://your-project.inth.app' });"
		);
	});

	test('returns null for fragments and unhandled languages', async () => {
		expect(
			await formatDocsCode('tsx', '<InthProvider state={state}>')
		).toBeNull();
		expect(await formatDocsCode('css', 'a{color:red}')).toBeNull();
	});
});

describe('formatMdxFences', () => {
	test('formats top-level fences and keeps their meta', async () => {
		const mdx = '# Title\n\n```ts title="a.ts"\nconst a = {\n  b: 1 }\n```\n';
		expect(await formatMdxFences(mdx)).toBe(
			'# Title\n\n```ts title="a.ts"\nconst a = { b: 1 };\n```\n'
		);
	});

	test('leaves indented fences and fragments as written', async () => {
		const mdx = [
			'- Item',
			'',
			'  ```ts',
			'  const a = {',
			'    b: 1 }',
			'  ```',
			'',
			'```tsx',
			'<InthProvider state={state}>',
			'```',
			'',
		].join('\n');
		expect(await formatMdxFences(mdx)).toBe(mdx);
	});
});

test('hand-written docs code is formatted (run bun run fmt:docs)', async () => {
	expect(await formatDocsFiles(root, false)).toEqual([]);
}, 60_000);
