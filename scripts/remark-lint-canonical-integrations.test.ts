import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { remark } from 'remark';
import { afterEach, beforeEach, expect, test } from 'vitest';

import remarkLintCanonicalIntegrations, {
	createCanonicalIntegrationCheck,
} from './remark-lint-canonical-integrations.mjs';

let directory: string;
let docsRoot: string;

const page = (title: string, aliases?: string[]) =>
	`---\ntitle: ${title}\ndescription: Checked vendor setup.\n${aliases ? `integrationAliases: ${JSON.stringify(aliases)}\n` : ''}---\n\nSetup instructions.\n`;

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'inth-integration-lint-'));
	docsRoot = join(directory, 'docs');
	mkdirSync(join(docsRoot, 'integrations'), { recursive: true });
	for (const [slug, title] of Object.entries({
		amplitude: 'Amplitude',
		'cloudflare-web-analytics': 'Cloudflare Web Analytics',
		'firebase-analytics': 'Firebase Analytics',
		'google-tag': 'Google Tag',
		'google-tag-manager': 'Google Tag Manager',
		gorgias: 'Gorgias Chat',
		'mixpanel-analytics': 'Mixpanel',
		posthog: 'PostHog',
		sentry: 'Sentry',
		'statable-analytics': 'Statable',
	})) {
		writeFileSync(join(docsRoot, `integrations/${slug}.mdx`), page(title));
	}
	writeFileSync(
		join(docsRoot, 'integrations/google-tag.mdx'),
		page('Google Tag', [
			'GA4',
			'Google Analytics',
			'Google Analytics 4',
			'Google Ads',
			'gtag',
			'gtag.js',
		])
	);
	writeFileSync(
		join(docsRoot, 'integrations/google-tag-manager.mdx'),
		page('Google Tag Manager', ['GTM'])
	);
});

afterEach(() => {
	rmSync(directory, { force: true, recursive: true });
});

test.each([
	['guides/mobile-posthog.mdx', 'PostHog for mobile', 'posthog'],
	[
		'guides/mobile-posthog-integration.mdx',
		'Mobile PostHog integration',
		'posthog',
	],
	['guides/mobile-posthog-setup.mdx', 'PostHog setup for mobile', 'posthog'],
	['guides/setup-mobile-posthog.mdx', 'Setup PostHog for mobile', 'posthog'],
	['guides/analytics-setup.mdx', 'Setup for PostHog on mobile', 'posthog'],
	['guides/analytics-setup.mdx', 'Guide on PostHog for Android', 'posthog'],
	['guides/setup-for-posthog.mdx', 'Product setup', 'posthog'],
	['guides/posthog-on-android.mdx', 'PostHog on Android', 'posthog'],
	['guides/mobile-firebase.mdx', 'Firebase for mobile', 'firebase-analytics'],
	[
		'guides/mobile-cloudflare.mdx',
		'Cloudflare for mobile',
		'cloudflare-web-analytics',
	],
	['guides/posthog-swift-guide.mdx', 'PostHog for Swift guide', 'posthog'],
	['guides/mobile-mixpanel.mdx', 'Mixpanel for mobile', 'mixpanel-analytics'],
	['guides/mobile-amplitude.mdx', 'Amplitude for mobile', 'amplitude'],
	['guides/mobile-sentry-replay.mdx', 'Sentry Replay for mobile', 'sentry'],
	[
		'guides/mobile-firebase-analytics.mdx',
		'Firebase Analytics for mobile',
		'firebase-analytics',
	],
	['frameworks/swift/posthog.mdx', 'PostHog', 'posthog'],
	['integrations/posthog-android.mdx', 'PostHog for Android', 'posthog'],
	['integrations/mobile/posthog.mdx', 'PostHog', 'posthog'],
	['integrations/posthog/mobile.mdx', 'Mobile setup', 'posthog'],
	['guides/posthog/android/setup.mdx', 'Setup', 'posthog'],
	['guides/mobile-posthog-sdk.mdx', 'PostHog SDK for mobile', 'posthog'],
	['guides/sdk-posthog-android.mdx', 'Android PostHog SDK', 'posthog'],
	[
		'guides/analytics-setup.mdx',
		'Mixpanel for React Native',
		'mixpanel-analytics',
	],
	[
		'guides/mobile-google-tag-manager.mdx',
		'Google Tag Manager for mobile',
		'google-tag-manager',
	],
])(
	'rejects %s and names the canonical page',
	async (path, title, canonical) => {
		await expect(
			remark()
				.use(remarkLintCanonicalIntegrations, { docsRoot })
				.process({ path: join(docsRoot, path), value: page(title) })
		).rejects.toMatchObject({
			fatal: true,
			reason: expect.stringContaining(`docs/integrations/${canonical}.mdx`),
			ruleId: 'canonical-integration-page',
		});
	}
);

test.each([
	['react', 'React'],
	['jetpack-compose', 'Jetpack Compose'],
	['compose', 'Compose'],
	['next', 'Next.js'],
	['nextjs', 'Next.js'],
	['next-js', 'Next.js'],
	['tanstack-start', 'TanStack Start'],
	['nuxt', 'Nuxt.js'],
	['vue', 'Vue.js'],
	['astro', 'Astro'],
	['svelte', 'Svelte'],
	['sveltekit', 'SvelteKit'],
	['svelte-kit', 'SvelteKit'],
	['angular', 'Angular'],
	['html', 'HTML'],
	['javascript', 'JavaScript'],
	['js', 'JS'],
	['solid', 'Solid.js'],
])('rejects %s vendor setup by filename or title', async (framework, title) => {
	const cases = [
		{
			heading: 'Product analytics',
			path: `guides/${framework}-posthog.mdx`,
		},
		{
			heading: `PostHog for ${title}`,
			path: 'guides/product-analytics.mdx',
		},
	];
	await Promise.all(
		cases.map(({ path, heading }) =>
			expect(
				remark()
					.use(remarkLintCanonicalIntegrations, { docsRoot })
					.process({ path: join(docsRoot, path), value: page(heading) })
			).rejects.toThrow('docs/integrations/posthog.mdx')
		)
	);
});

test.each([
	['integrations/posthog.mdx', 'PostHog'],
	['integrations/mixpanel-analytics.mdx', 'Mixpanel'],
	['integrations/firebase-analytics.mdx', 'Firebase Analytics'],
	['integrations/google-tag-manager.mdx', 'Google Tag Manager'],
	['shared/mobile/posthog.mdx', 'PostHog for mobile'],
	['shared/examples/react-native-bare/rn-posthog-integration.mdx', 'PostHog'],
	['frameworks/swift/iab.mdx', 'IAB and ads'],
	['frameworks/android/verify.mdx', 'Verify consent'],
	['frameworks/swift/quickstart.mdx', 'Quickstart'],
	['frameworks/react/vendor-consent.mdx', 'Vendor consent'],
])('allows %s', async (path, title) => {
	const result = await remark()
		.use(remarkLintCanonicalIntegrations, { docsRoot })
		.process({
			path: join(docsRoot, path),
			value: `${page(title)}\nSee [PostHog](/docs/integrations/posthog).\n`,
		});
	expect(result.messages).toEqual([]);
});

test('detects new vendors without a hard-coded service list', async () => {
	writeFileSync(
		join(docsRoot, 'integrations/new-analytics.mdx'),
		page('New Analytics')
	);
	await expect(
		remark()
			.use(remarkLintCanonicalIntegrations, { docsRoot })
			.process({
				path: join(docsRoot, 'guides/mobile-new-analytics.mdx'),
				value: page('New Analytics for mobile'),
			})
	).rejects.toThrow('docs/integrations/new-analytics.mdx');
});

test.each([
	['ga4', 'GA4', 'google-tag'],
	['google-analytics', 'Google Analytics', 'google-tag'],
	['google-analytics-4', 'Google Analytics 4', 'google-tag'],
	['google-ads', 'Google Ads', 'google-tag'],
	['gtag', 'gtag', 'google-tag'],
	['gtag-js', 'gtag.js', 'google-tag'],
	['gtm', 'GTM', 'google-tag-manager'],
])(
	'recognizes %s by filename and title independently',
	async (slug, title, canonical) => {
		await Promise.all(
			[
				{ heading: 'Product setup', path: `guides/react-${slug}.mdx` },
				{ heading: `${title} for React`, path: 'guides/product-setup.mdx' },
			].map(({ path, heading }) =>
				expect(
					remark()
						.use(remarkLintCanonicalIntegrations, { docsRoot })
						.process({ path: join(docsRoot, path), value: page(heading) })
				).rejects.toThrow(`docs/integrations/${canonical}.mdx`)
			)
		);
	}
);

test.each(['GA4', 'null', '[42]', '[null]', '["   "]', '["!!!"]'])(
	'rejects invalid alias metadata %s',
	(aliases) => {
		writeFileSync(
			join(docsRoot, 'integrations/new-analytics.mdx'),
			page('New Analytics').replace(
				'---\n\n',
				`integrationAliases: ${aliases}\n---\n\n`
			)
		);
		expect(() =>
			remark()
				.use(remarkLintCanonicalIntegrations, { docsRoot })
				.process({
					path: join(docsRoot, 'guides/new-analytics.mdx'),
					value: page('New Analytics'),
				})
		).toThrow(
			'integrationAliases must be an array of nonempty names. (docs/integrations/new-analytics.mdx)'
		);
	}
);

test.each(['integrations/new-analytics.mdx', 'guides/product-setup.mdx'])(
	'rejects malformed frontmatter and identifies %s',
	(path) => {
		const malformed = '---\ntitle: [PostHog\n---\n\nSetup instructions.\n';
		if (path.startsWith('integrations/')) {
			writeFileSync(join(docsRoot, path), malformed);
		}
		expect(() => {
			const check = createCanonicalIntegrationCheck(docsRoot);
			check(join(docsRoot, path), malformed);
		}).toThrow(`Invalid frontmatter in docs/${path}:`);
	}
);

test.each([
	['ga4', 'google-tag'],
	['gtm', 'google-tag-manager'],
])(
	'the source docs register %s on the canonical %s page',
	(alias, canonical) => {
		const sourceDocs = fileURLToPath(
			new URL('../packages/sdk/docs', import.meta.url)
		);
		const check = createCanonicalIntegrationCheck(sourceDocs);
		expect(
			check(
				join(sourceDocs, `guides/react-${alias}.mdx`),
				page('Product setup')
			)
		).toEqual({
			canonical: `integrations/${canonical}.mdx`,
		});
	}
);

test('supports declared aliases for new vendors without treating body text as aliases', async () => {
	writeFileSync(
		join(docsRoot, 'integrations/new-analytics.mdx'),
		`${page('New Analytics', ['NAX'])}\nUses unrelated products too.\n`
	);
	const processor = remark().use(remarkLintCanonicalIntegrations, { docsRoot });
	await expect(
		processor.process({
			path: join(docsRoot, 'guides/nax-swift.mdx'),
			value: page('Product setup'),
		})
	).rejects.toThrow('docs/integrations/new-analytics.mdx');
	await expect(
		processor.process({
			path: join(docsRoot, 'guides/google.mdx'),
			value: page('Google'),
		})
	).resolves.toMatchObject({ messages: [] });
});

test.each(['GA4', 'GTM'])(
	'adding an alias page for %s preserves its registered canonical route',
	async (alias) => {
		const canonical = alias === 'GA4' ? 'google-tag' : 'google-tag-manager';
		const duplicate = join(docsRoot, `integrations/${alias.toLowerCase()}.mdx`);
		writeFileSync(duplicate, page(alias));
		const processor = remark().use(remarkLintCanonicalIntegrations, {
			docsRoot,
		});
		const canonicalPath = join(docsRoot, `integrations/${canonical}.mdx`);
		await expect(
			processor.process({
				path: canonicalPath,
				value: readFileSync(canonicalPath, 'utf8'),
			})
		).resolves.toMatchObject({ messages: [] });
		await expect(
			processor.process({ path: duplicate, value: page(alias) })
		).rejects.toThrow(`docs/integrations/${canonical}.mdx`);
	}
);

test('a duplicate inside integrations cannot declare itself canonical', async () => {
	const path = join(docsRoot, 'integrations/posthog-mobile.mdx');
	writeFileSync(path, page('PostHog'));
	await expect(
		remark()
			.use(remarkLintCanonicalIntegrations, { docsRoot })
			.process({ path, value: page('PostHog') })
	).rejects.toThrow('docs/integrations/posthog.mdx');
});

test.each(['posthog-guide', 'aaa-posthog'])(
	'adding %s preserves the existing canonical page',
	async (slug) => {
		const duplicate = join(docsRoot, `integrations/${slug}.mdx`);
		writeFileSync(duplicate, page('PostHog'));
		const processor = remark().use(remarkLintCanonicalIntegrations, {
			docsRoot,
		});

		await expect(
			processor.process({
				path: join(docsRoot, 'integrations/posthog.mdx'),
				value: page('PostHog'),
			})
		).resolves.toMatchObject({ messages: [] });
		await expect(
			processor.process({ path: duplicate, value: page('PostHog') })
		).rejects.toThrow('docs/integrations/posthog.mdx');
	}
);

test.each([
	['mixpanel', 'Mixpanel', 'mixpanel-analytics'],
	['mixpanel', 'Mixpanel SDK', 'mixpanel-analytics'],
	['statable', 'Statable', 'statable-analytics'],
	['gorgias-chat', 'Gorgias Chat', 'gorgias'],
])(
	'adding %s titled %s cannot replace the registered canonical route',
	async (slug, title, canonical) => {
		const duplicate = join(docsRoot, `integrations/${slug}.mdx`);
		writeFileSync(duplicate, page(title));
		const processor = remark().use(remarkLintCanonicalIntegrations, {
			docsRoot,
		});
		await expect(
			processor.process({
				path: join(docsRoot, `integrations/${canonical}.mdx`),
				value: readFileSync(
					join(docsRoot, `integrations/${canonical}.mdx`),
					'utf8'
				),
			})
		).resolves.toMatchObject({ messages: [] });
		await expect(
			processor.process({ path: duplicate, value: page(title) })
		).rejects.toThrow(`docs/integrations/${canonical}.mdx`);
	}
);

test.each(['acme-data', 'acme'])(
	'unregistered alias collisions on %s report both routes without choosing a replacement',
	async (slug) => {
		const slugs = ['acme-data', 'acme'];
		for (const candidate of slugs) {
			writeFileSync(
				join(docsRoot, `integrations/${candidate}.mdx`),
				page('Acme')
			);
		}
		await expect(
			remark()
				.use(remarkLintCanonicalIntegrations, { docsRoot })
				.process({
					path: join(docsRoot, `integrations/${slug}.mdx`),
					value: page('Acme'),
				})
		).rejects.toThrow(
			'Ambiguous integration pages: docs/integrations/acme-data.mdx, docs/integrations/acme.mdx.'
		);
	}
);

test('remark CLI exits unsuccessfully for a separate mobile vendor page', () => {
	const path = join(docsRoot, 'guides/mobile-posthog.mdx');
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, page('PostHog for mobile'));
	const config = join(directory, '.remarkrc.json');
	writeFileSync(
		config,
		JSON.stringify({
			plugins: [
				[
					fileURLToPath(
						new URL('./remark-lint-canonical-integrations.mjs', import.meta.url)
					),
					{ docsRoot },
				],
			],
		})
	);
	expect(() =>
		execFileSync('bunx', ['remark', path, '--rc-path', config], {
			stdio: 'pipe',
		})
	).toThrow(/canonical-integration-page/u);
});
