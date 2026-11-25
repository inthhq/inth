/** Framework guides a package skill can point to, in selector order. */
export const frameworkGuides = [
	['next', 'Next.js'],
	['tanstack-start', 'TanStack Start'],
	['react', 'React'],
	['nuxt', 'Nuxt'],
	['vue', 'Vue'],
	['astro', 'Astro'],
	['svelte', 'Svelte'],
	['sveltekit', 'SvelteKit'],
	['angular', 'Angular'],
	['html', 'HTML script tag'],
	['javascript', 'JavaScript'],
] as const;

/**
 * Package skill metadata. `topic` completes "Use when ..." and names the
 * frameworks or task the package serves.
 */
export interface PackageSkill {
	topic: string;
	install: string;
}

/**
 * The skill name for a package: its npm name without `@`, with `/` as `-`.
 *
 * The name is the frontmatter `name` and the `skills/<name>/` directory. Expo's
 * `skills:sync` links a skill under its directory name, and skills-npm under
 * its frontmatter name, so both must agree.
 *
 * @param packageName - The npm package name, such as `@inth/react-native`.
 * @returns The skill name, such as `inth-react-native`.
 */
export const packageSkillName = (packageName: string): string =>
	packageName.replace(/^@/u, '').replace(/\//gu, '-');

const link = (
	bundledFiles: ReadonlySet<string>,
	file: string,
	label: string
): string | undefined =>
	bundledFiles.has(file) ? `[${label}](./docs/${file})` : undefined;

/**
 * Renders the SKILL.md that ships next to AGENTS.md. It replaces leadtype's
 * generic pointer with the decisions an agent must get right before it reads
 * a guide. Links only point to pages present in this package's bundle.
 */
export const renderPackageSkill = function renderPackageSkill(
	packageName: string,
	skill: PackageSkill,
	bundledFiles: ReadonlySet<string>
): string {
	if (packageName === '@inth/react-native') {
		const guides = [
			['quickstart', 'React Native quickstart'],
			['expo', 'Expo and EAS'],
			['bare', 'Bare React Native'],
			['apple', 'iOS native installation in RN'],
			['android', 'Android native dependencies in RN'],
			['native-behaviour', 'Install and gate before JavaScript'],
			['usage', 'Commands and durable commit results'],
			['offline', 'Bundled policies and withdrawal'],
			['iab', 'IAB, Additional Consent and ad SDK gates'],
			['customize', 'Native screen customization'],
			['headless', 'Headless hooks'],
			['platform-support', 'Compatibility and OTA'],
			['verify', 'Verify the integration'],
			['troubleshooting', 'Troubleshooting'],
		]
			.map(([file, label]) =>
				link(bundledFiles, `frameworks/react-native/${file}.md`, label ?? '')
			)
			.filter(Boolean);
		const nativeGuides = [
			['frameworks/swift/quickstart.md', 'SwiftUI quickstart'],
			['frameworks/swift/uikit.md', 'UIKit setup'],
			['frameworks/android/quickstart.md', 'Android quickstart'],
			['frameworks/swift/iab.md', 'Swift IAB setup'],
			['frameworks/android/iab.md', 'Android IAB setup'],
			[
				'frameworks/react-native/availability.md',
				'Mobile availability and release scope',
			],
		]
			.map(([file, label]) => link(bundledFiles, file ?? '', label ?? ''))
			.filter(Boolean);
		return [
			'---',
			`name: ${packageSkillName(packageName)}`,
			'description: Set up or debug native Inth consent in React Native, Expo, Swift and Kotlin apps. Read the private prerelease distribution limits before installing.',
			'---',
			'',
			'# Inth mobile consent',
			'',
			'This package is a private prerelease. The bundled docs describe source APIs, not a production release, verified registry installation or device certification.',
			'',
			'## Start here',
			'',
			...guides.map((guide) => `- ${guide}`),
			...nativeGuides.map((guide) => `- ${guide}`),
			'',
			'## Rules',
			'',
			'- Use the maintainer-provided private package and native artifacts. Do not invent an npm version, Maven repository, SwiftPM tag or certification claim.',
			"- Start with the developer's Inth project URL and authored policy. The repository reference apps use https://example-inth.inth.app/. A project URL is public configuration, not a secret.",
			'- Install one native engine before optional SDKs and before React Native starts. InthProvider attaches to it; JavaScript does not bootstrap another engine.',
			'- Disable vendor auto-initializers. Gate native startup on cached native permissions and reevaluate after withdrawal. React hooks alone cannot gate startup before JavaScript.',
			'- Check CommitResult.ok. A resolved promise can refuse a commit. ok:true with queued:true is durable local success; it does not prove network delivery.',
			'- Keep drafts open after refused commits. Never turn a policy refresh, hydration, ATT result or notice acknowledgement into a consent grant.',
			'- Keep hosted transport when embedding an offline policy. Verify endpoint binding, authority expiry and original disclosure timestamps. Withdrawals must persist without network access.',
			'- ATT is separate. Marketing consent, a TC String and platform storage keys do not prove AdMob interoperability, Google certification or IAB registration.',
			'- Prefer native stock presenter commands. Configure their supported themes natively. Use headless hooks when the app owns the UI. Mobile works only with Inth hosted projects.',
			'- Match RN, React, Expo and native protocol versions. Native APIs, themes, permissions, Codegen and bundled-policy changes require a new binary.',
			'',
			'./docs/README.md lists every bundled page. Verify real native builds and device journeys separately from JavaScript type checks.',
			'',
		].join('\n');
	}
	if (packageName === '@inth/node') {
		const guides = [
			['quickstart', 'Quickstart: link users at sign-in and read consent'],
			['legal-documents', 'Publish documents and record acceptance'],
			['identity-tokens', 'Link users from a server without the cookie'],
			['errors', 'Error codes, retries and timeouts'],
			['api', 'API reference'],
			['troubleshooting', 'Troubleshooting'],
		]
			.map(([file, label]) =>
				link(bundledFiles, `node/${file}.md`, label ?? '')
			)
			.filter(Boolean);
		return [
			'---',
			`name: ${packageSkillName(packageName)}`,
			`description: Call the Inth API from a server with ${packageName}. Use when ${skill.topic}, on Node.js, Vercel Functions or Cloudflare Workers.`,
			'---',
			'',
			`# Inth with ${packageName}`,
			'',
			'The Markdown under `./docs` matches the installed version. Read it before writing code instead of guessing APIs from memory.',
			'',
			'## Start here',
			'',
			...guides.map((guide) => `- ${guide}`),
			'',
			'## Rules',
			'',
			`- Install with ${skill.install}.`,
			'- ALWAYS keep the secret key on the server, in `INTH_SECRET_KEY`. It can act for every user in the project. NEVER put it in a variable the browser bundle reads, such as one starting with `NEXT_PUBLIC_` or `VITE_`.',
			"- `INTH_PROJECT_URL` is the user's Inth project URL. Never invent one; ask for it. On Cloudflare Workers without `nodejs_compat`, pass `secretKey` and `projectUrl` from `env`, because there is no `process.env`.",
			'- ALWAYS check `error` before reading `data`. A failed call says nothing about the user: NEVER treat it as a refusal, re-prompt for documents or record anything because of it.',
			'- Branch on `error.retryable` to decide whether to try again later. NEVER resend `documents.publish` blindly: a failed publish may have been stored, so call `documents.current` first.',
			'- Read the subject ID with `readRequestConsent` from `@inth/sdk/server`. NEVER parse the consent cookie: its format changes between releases.',
			'- `consents.check` returns the full `UserConsent` document (`categories`, `optOut`, `sync`). Read category booleans from `data.categories`. A category absent from `data.categories` was never answered or has expired; apply the policy default (refused under opt-in).',
			"- Record acceptance with the `hash` that `documents.current` gave when the form was shown, and the visitor's IP address and user agent from the request. NEVER take the first entry of `x-forwarded-for`: the visitor writes it.",
			'',
			'## Finish with a check',
			'',
			'Run the app. Reject marketing in the banner, sign in, and confirm `consents.check` returns `data.categories.marketing === false` for that user.',
			'',
		].join('\n');
	}
	const slug = packageSkillName(packageName);
	const packageLabel = packageName;
	const heading = `Inth with ${packageName}`;
	const quickstarts = frameworkGuides
		.map(([dir, label]) =>
			link(bundledFiles, `frameworks/${dir}/quickstart.md`, label)
		)
		.filter(Boolean);
	const migration = link(
		bundledFiles,
		'migrate-from-c15t.md',
		'Migrate from c15t'
	);
	const lines = [
		'---',
		`name: ${slug}`,
		`description: Set up, customize or debug Inth consent management with ${packageLabel}. Use when ${skill.topic}, or when a task mentions a cookie banner, consent dialog, GDPR or CCPA prompts, blocking analytics until consent, Google Consent Mode or IAB TCF.`,
		'---',
		'',
		`# ${heading}`,
		'',
		`The Markdown under \`./docs\` matches the installed version. Read it before writing code instead of guessing APIs from memory.${migration ? ` Migrating an existing c15t app? Follow ${migration}.` : ''}`,
		'',
		'## Before writing code',
		'',
		'1. Find the framework, router, rendering mode (server, static, cached or single-page) and host in the project. Check the framework config and route files for settings that prerender or cache pages.',
	];
	const chooser = link(
		bundledFiles,
		'concepts/choose-your-setup.md',
		'Choose your setup'
	);
	if (chooser) {
		lines.push(`2. Pick the matching row in ${chooser}.`);
	}
	if (quickstarts.length > 0) {
		lines.push(
			`${chooser ? 3 : 2}. Follow that guide from start to finish: ${quickstarts.join(', ')}.`
		);
	}
	lines.push(
		'',
		'## Rules',
		'',
		`- Install with ${skill.install}. Keep every Inth package on the same release.`,
		"- `projectUrl` is the user's Inth project URL. It is public configuration. Never invent one; ask for it or read it from the environment.",
		'- Register analytics, pixels and embeds through Inth and remove the vendor\'s own loader or plugin. With a bundler, use `@inth/integrations` helpers and `ConsentGate`. On a plain HTML page, change the vendor\'s `<script>` to `type="text/plain"` with `data-inth-category`. A banner does not block code loaded elsewhere.',
		'- Gate features on the current permission. Never save a consent choice on page load or from code; only a visitor action records one.',
		"- Use `testing()` from the package's `/testing` subpath in tests and local development: it resolves policies in code with no network requests and throws in production builds.",
		'- Keep one consent provider or root for the whole app, mounted outside route-level components.',
		'',
		'## Customize with the smallest change',
		'',
		"Copy and languages use i18n configuration. Where the banner sits uses `container` (a Card, Banner or Drawer), `edgeStyle` and `blockUntilChoice`, on `ConsentBanner`, in `presentation.prompt` or from the policy's `surface`. Colors, type, radius and spacing use theme tokens. One part of a component uses slots. Different markup uses the headless API. Keep a `PrivacyChoicesLink` in the footer so visitors can reopen the dialog."
	);
	const customize =
		link(bundledFiles, 'customization/overview.md', 'Customization overview') ??
		frameworkGuides
			.map(([dir, label]) =>
				link(
					bundledFiles,
					`frameworks/${dir}/customize.md`,
					`${label} customization`
				)
			)
			.find(Boolean);
	if (customize) {
		lines.push(`Start at ${customize}.`);
	}
	const verify = link(
		bundledFiles,
		'guides/verify-consent.md',
		'Verify consent before shipping'
	);
	const troubleshoot = link(
		bundledFiles,
		'guides/troubleshooting.md',
		'Troubleshooting'
	);
	lines.push(
		'',
		'## Finish with a check',
		'',
		`A visible banner proves nothing. In a production build, confirm vendor requests are absent before consent, a rejection survives a reload, and preferences reopen.${verify ? ` Follow ${verify}.` : ''}${troubleshoot ? ` If something fails, start with ${troubleshoot}.` : ''}`,
		'',
		'`./AGENTS.md` lists every bundled page.',
		''
	);
	return lines.join('\n');
};
