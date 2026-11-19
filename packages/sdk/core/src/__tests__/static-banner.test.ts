import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createConsentManifestPolicyPack } from '@inth/sdk-schema/types';
import { build } from 'vite';
import type { Rollup } from 'vite';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { consentManifest } from '../build';

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((path) => rm(path, { force: true, recursive: true }))
	);
});

const write = async (path: string, source: string): Promise<void> => {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, source);
};

const EAGER_CSS = '.banner{color:rebeccapurple}';

/**
 * An app root with stand-ins for the installed `@inth/react` and `@inth/sdk/ui`:
 * the stock banner's root module imports the banner sheet, and
 * `@inth/react/static-banner` renders the title from the `/v1/consent/init` answer it
 * is given.
 */
const createApp = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'inth-static-banner-'));
	directories.push(root);
	const react = join(root, 'node_modules/@inth/react');
	await write(
		join(react, 'package.json'),
		JSON.stringify({
			exports: {
				'./banner': './dist/components/prompt/atoms/root.js',
				'./part': './dist/index-parts/consent-banner.js',
				'./static-banner': './dist/static-banner.js',
			},
			imports: {
				'#consent-banner': './dist/components/prompt/atoms/root.js',
			},
			name: '@inth/react',
			type: 'module',
		})
	);
	await write(
		join(react, 'dist/components/prompt/atoms/root.js'),
		"import * as sheet from '@inth/sdk/ui/styles/sheets/banner';\nexport const banner = () => sheet.id + sheet.css;\n"
	);
	// `ConsentBanner`'s index part, and the gate a static-banner build
	// resolves its `#consent-banner` to: the banner's code in a lazy chunk.
	await write(
		join(react, 'dist/index-parts/consent-banner.js'),
		"export { banner } from '#consent-banner';\n"
	);
	await write(
		join(react, 'dist/deferred/client-banner.js'),
		"export const banner = () => import('../components/prompt/atoms/root.js').then((root) => root.banner());\n"
	);
	await write(
		join(react, 'dist/static-banner.js'),
		[
			`export const STATIC_BANNER_SHEETS = [{ id: 'inth-banner', css: ${JSON.stringify(EAGER_CSS)} }];`,
			'export const renderStaticBanner = (init) =>',
			"\tinit.policyResolution?.policy?.prompt === 'choice'",
			// oxlint-disable-next-line no-template-curly-in-string -- Source text of a module.
			'\t\t? `<div data-testid="consent-banner-root">${init.translations.translations.cookieBanner.title}</div>`',
			'\t\t: undefined;',
			'',
		].join('\n')
	);
	const sdk = join(react, 'node_modules/@inth/sdk');
	await write(
		join(sdk, 'package.json'),
		JSON.stringify({
			exports: {
				'./ui/styles/sheets/*': './lib/ui/dist/styles/sheets/*.js',
			},
			name: '@inth/sdk',
			type: 'module',
		})
	);
	const ui = join(sdk, 'lib/ui');
	await write(
		join(ui, 'dist/styles/sheets/banner.js'),
		`export const id = 'inth-banner';\nexport const css = ${JSON.stringify(EAGER_CSS)};\n`
	);
	await write(
		join(ui, 'dist/styles/sheets/banner-deferred.js'),
		"export const id = 'inth-banner';\nexport const css = '';\nexport const load = () => import('./banner.js').then((sheet) => sheet.css);\n"
	);
	const page = (script: string) =>
		`<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="UTF-8" />\n\t</head>\n\t<body>\n\t\t<div id="root"></div>\n\t\t<script type="module" src="${script}"></script>\n\t</body>\n</html>\n`;
	await write(join(root, 'index.html'), page('/src/app.js'));
	await write(join(root, 'baseline.html'), page('/src/baseline.js'));
	await write(
		join(root, 'src/app.js'),
		"import { banner } from '@inth/react/banner';\nimport { projectUrl } from '@inth/sdk/generated';\nconsole.log(banner(), projectUrl);\n"
	);
	await write(join(root, 'src/baseline.js'), "console.log('no consent');\n");
	return root;
};

const CHOICE_MANIFEST = {
	branding: 'inth',
	policyPacks: [
		createConsentManifestPolicyPack({
			id: 'eu',
			match: { countries: ['DE'] },
			model: 'opt-in',
			prompt: 'choice',
		}),
		createConsentManifestPolicyPack({
			id: 'world',
			match: { isDefault: true },
			model: 'none',
			prompt: 'none',
		}),
	],
	revision: 'static-banner-test',
	schemaVersion: 2,
	translations: {
		customTranslations: {
			en: { cookieBanner: { title: 'Cookies on Example' } },
		},
	},
};

const NO_BANNER_MANIFEST = {
	...CHOICE_MANIFEST,
	policyPacks: [CHOICE_MANIFEST.policyPacks[1]],
};

const fetchManifest = (manifest: unknown) =>
	vi
		.fn<typeof globalThis.fetch>()
		.mockImplementation(() => Promise.resolve(Response.json(manifest)));

interface Built {
	pages: Record<string, string>;
	code: string;
}

const buildApp = async (
	root: string,
	plugin: ReturnType<typeof consentManifest>,
	warn: (message: string) => void = () => undefined
): Promise<Built> => {
	const output = (await build({
		build: {
			minify: false,
			rollupOptions: {
				input: {
					baseline: join(root, 'baseline.html'),
					cmp: join(root, 'index.html'),
				},
			},
			write: false,
		},
		configFile: false,
		customLogger: {
			clearScreen: () => undefined,
			error: () => undefined,
			hasErrorLogged: () => false,
			hasWarned: false,
			info: () => undefined,
			warn,
			warnOnce: warn,
		},
		logLevel: 'silent',
		plugins: [plugin],
		root,
	})) as Rollup.RollupOutput | Rollup.RollupOutput[];
	const [first] = Array.isArray(output) ? output : [output];
	const pages: Record<string, string> = {};
	let code = '';
	for (const file of first?.output ?? []) {
		if (file.type === 'asset' && file.fileName.endsWith('.html')) {
			pages[file.fileName] = String(file.source);
		} else if (file.type === 'chunk' && file.isEntry) {
			code += file.code;
		}
	}
	return { code, pages };
};

const BANNER_TAG = '<div data-inth-static-banner hidden>';

describe('consentManifest staticBanner', () => {
	test("puts the stock banner, with the manifest's copy, and its sheets in index.html", async () => {
		const root = await createApp();
		const fetch = fetchManifest(CHOICE_MANIFEST);
		const { code, pages } = await buildApp(
			root,
			consentManifest({ fetch, projectUrl: 'https://consent.example.com' })
		);
		const html = pages['index.html'] ?? '';
		expect(fetch).toHaveBeenCalledWith(
			'https://consent.example.com/v1/consent/manifest',
			expect.anything()
		);
		// The banner starts the body, hidden, followed by the reveal script.
		expect(html).toMatch(
			/<body>\s*<div data-inth-static-banner hidden><div data-testid="consent-banner-root">Cookies on Example<\/div><\/div><script>/u
		);
		expect(html).toContain(
			`<style data-href="inth-banner" data-precedence="inth">${EAGER_CSS}</style></head>`
		);
		// The sheet's text left the entry: it ships once, in the page.
		expect(code).not.toContain('rebeccapurple');
		// The page with no consent manager gets neither.
		expect(pages['baseline.html']).not.toContain('data-inth-static-banner');
		expect(pages['baseline.html']).not.toContain('data-precedence="inth"');
	});

	test("a page with the static banner loads ConsentBanner's code after its own", async () => {
		const root = await createApp();
		await write(
			join(root, 'src/app.js'),
			"import { banner } from '@inth/react/part';\nimport { projectUrl } from '@inth/sdk/generated';\nconsole.log(banner, projectUrl);\n"
		);
		const { code, pages } = await buildApp(
			root,
			consentManifest({
				fetch: fetchManifest(CHOICE_MANIFEST),
				projectUrl: 'https://consent.example.com',
			})
		);
		expect(pages['index.html']).toContain(
			`${BANNER_TAG}<div data-testid="consent-banner-root">Cookies on Example</div></div>`
		);
		// `#consent-banner` resolved to the gate: the entry imports the
		// banner's module, it does not hold it.
		expect(code).toContain('import(');
		expect(code).not.toContain('id + css');
	});

	test('staticBanner: false keeps ConsentBanner in the first load', async () => {
		const root = await createApp();
		await write(
			join(root, 'src/app.js'),
			"import { banner } from '@inth/react/part';\nimport { projectUrl } from '@inth/sdk/generated';\nconsole.log(banner(), projectUrl);\n"
		);
		const { code } = await buildApp(
			root,
			consentManifest({
				fetch: fetchManifest(CHOICE_MANIFEST),
				projectUrl: 'https://consent.example.com',
				staticBanner: false,
			})
		);
		expect(code).toContain('id + css');
	});

	test('a manifest without a choice banner leaves the banner out and keeps the sheets', async () => {
		const root = await createApp();
		const { code, pages } = await buildApp(
			root,
			consentManifest({
				fetch: fetchManifest(NO_BANNER_MANIFEST),
				projectUrl: 'https://consent.example.com',
			})
		);
		expect(pages['index.html']).not.toContain(BANNER_TAG);
		expect(pages['index.html']).toContain('<style data-href="inth-banner"');
		expect(code).not.toContain('rebeccapurple');
	});

	test('a failed manifest fetch warns and builds without the banner', async () => {
		const root = await createApp();
		const warn = vi.fn();
		const { pages } = await buildApp(
			root,
			consentManifest({
				fetch: vi
					.fn<typeof globalThis.fetch>()
					.mockImplementation(() => Promise.reject(new TypeError('offline'))),
				projectUrl: 'https://consent.example.com',
			}),
			warn
		);
		expect(pages['index.html']).not.toContain(BANNER_TAG);
		expect(pages['index.html']).toContain('<style data-href="inth-banner"');
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				'staticBanner: could not fetch the consent manifest'
			)
		);
	});

	test('staticBanner: false changes nothing', async () => {
		const root = await createApp();
		const fetch = fetchManifest(CHOICE_MANIFEST);
		const { code, pages } = await buildApp(
			root,
			consentManifest({
				fetch,
				projectUrl: 'https://consent.example.com',
				staticBanner: false,
			})
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(pages['index.html']).not.toContain('data-inth-static-banner');
		expect(pages['index.html']).not.toContain('data-precedence="inth"');
		expect(code).toContain('rebeccapurple');
	});

	test('a build without an HTML page keeps the sheets in the JavaScript', async () => {
		// A backend that renders its own pages around the bundle has no
		// `index.html` to hold them.
		const root = await createApp();
		const fetch = fetchManifest(CHOICE_MANIFEST);
		const output = (await build({
			build: {
				minify: false,
				rollupOptions: { input: join(root, 'src/app.js') },
				write: false,
			},
			configFile: false,
			logLevel: 'silent',
			plugins: [
				consentManifest({ fetch, projectUrl: 'https://consent.example.com' }),
			],
			root,
		})) as Rollup.RollupOutput | Rollup.RollupOutput[];
		const [first] = Array.isArray(output) ? output : [output];
		const code = (first?.output ?? [])
			.map((file) => (file.type === 'chunk' ? file.code : ''))
			.join('\n');
		expect(code).toContain('rebeccapurple');
		expect(fetch).not.toHaveBeenCalled();
	});

	test('without the /init script there is no banner to reveal', async () => {
		const root = await createApp();
		const fetch = fetchManifest(CHOICE_MANIFEST);
		const { pages } = await buildApp(
			root,
			consentManifest({
				fetch,
				initPrefetch: false,
				projectUrl: 'https://consent.example.com',
			})
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(pages['index.html']).not.toContain('data-inth-static-banner');
	});
});
