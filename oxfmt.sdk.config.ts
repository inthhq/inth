import { defineConfig } from 'oxfmt';
import ultracite from 'ultracite/oxfmt';

export default defineConfig({
	...ultracite,
	ignorePatterns: [
		...ultracite.ignorePatterns,
		'.codex/**',
		'.repos/**',
		'.tmp-bun/**',
		'**/*.md',
		'**/*.mdx',
		// Registry sources and vendored shadcn ui keep upstream shadcn formatting.
		'apps/shadcn-registry/registry/**',
		'apps/shadcn-registry/vendor/**',
		'packages/sdk/ui/types/**',
		// A copy of the backend's document, replaced whole when it changes.
		'packages/sdk/schema/vendor/backend-openapi/openapi.json',
	],
	jsxSingleQuote: false,
	printWidth: 80,
	semi: true,
	singleAttributePerLine: true,
	singleQuote: true,
	sortImports: {
		ignoreCase: true,
		newlinesBetween: true,
		order: 'asc',
	},
	sortPackageJson: {
		sortScripts: true,
	},
	sortTailwindcss: {
		functions: ['clsx', 'cva', 'tw', 'twMerge', 'cn', 'twJoin', 'tv'],
	},
	svelte: true,
	tabWidth: 2,
	trailingComma: 'es5',
	useTabs: true,
});
