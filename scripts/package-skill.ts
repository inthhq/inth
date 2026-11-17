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
	/** True when the `c15t` umbrella package re-exports this package. */
	umbrella?: boolean;
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
			['guides/mobile-iab.md', 'Native IAB setup'],
			['guides/mobile-status.md', 'Mobile availability and release scope'],
		]
			.map(([file, label]) => link(bundledFiles, file ?? '', label ?? ''))
			.filter(Boolean);
		return [
			'---',
			`name: ${packageSkillName(packageName)}`,
			'description: Set up or debug native c15t consent in React Native, Expo, Swift and Kotlin apps. Read the private prerelease distribution limits before installing.',
			'---',
			'',
			'# c15t mobile consent',
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
			"- Start with the developer's Inth project URL and authored policy. The repository reference apps use https://example-inth.inth.app/. A backend URL is public configuration, not a secret.",
			'- Install one native engine before optional SDKs and before React Native starts. ConsentProvider attaches to it; JavaScript does not bootstrap another engine.',
			'- Disable vendor auto-initializers. Gate native startup on cached native permissions and reevaluate after withdrawal. React hooks alone cannot gate startup before JavaScript.',
			'- Check CommitResult.ok. A resolved promise can refuse a commit. ok:true with queued:true is durable local success; it does not prove network delivery.',
			'- Keep drafts open after refused commits. Never turn a policy refresh, hydration, ATT result or notice acknowledgement into a consent grant.',
			'- Keep hosted transport when embedding an offline policy. Verify endpoint binding, authority expiry and original disclosure timestamps. Withdrawals must persist without network access.',
			'- ATT is separate. Marketing consent, a TC String and platform storage keys do not prove AdMob interoperability, Google certification or IAB registration.',
			'- Prefer native stock presenter commands. Configure their supported themes natively. Use headless hooks when the app owns the UI. Mobile works only with Inth hosted projects; there is no self-hosted backend or custom transport.',
			'- Match RN, React, Expo and native protocol versions. Native APIs, themes, permissions, Codegen and bundled-policy changes require a new binary.',
			'',
			'./docs/README.md lists every bundled page. Verify real native builds and device journeys separately from JavaScript type checks.',
			'',
		].join('\n');
	}
	const slug = packageSkillName(packageName);
	// The umbrella package is itself named c15t, so "c15t with c15t" says
	// nothing about which package the skill ships in.
	const isUmbrella = packageName === 'c15t';
	const packageLabel = isUmbrella ? 'the c15t umbrella package' : packageName;
	const heading = isUmbrella
		? 'c15t (umbrella package)'
		: `c15t with ${packageName}`;
	const quickstarts = frameworkGuides
		.map(([dir, label]) =>
			link(bundledFiles, `frameworks/${dir}/quickstart.md`, label)
		)
		.filter(Boolean);
	const lines = [
		'---',
		`name: ${slug}`,
		`description: Set up, customize or debug c15t consent management with ${packageLabel}. Use when ${skill.topic}, or when a task mentions a cookie banner, consent dialog, GDPR or CCPA prompts, blocking analytics until consent, Google Consent Mode or IAB TCF.`,
		'---',
		'',
		`# ${heading}`,
		'',
		'The Markdown under `./docs` matches the installed version. Read it before writing code: v3 renamed most v2 APIs, so remembered examples are usually wrong.',
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
		`- Install with ${skill.install}. Keep every c15t package on the same release.${skill.umbrella ? ' New apps install `c15t` and import its framework subpath. An app that already depends on this scoped package can keep importing from it, but should not install both.' : ''}`,
		"- The backend URL comes from the user's Inth project or self-hosted backend. It is public configuration. Never invent one; ask for it or read it from the environment.",
		'- Register analytics, pixels and embeds through c15t and remove the vendor\'s own loader or plugin. With a bundler, use `@c15t/integrations` helpers and `ConsentGate`. On a plain HTML page, change the vendor\'s `<script>` to `type="text/plain"` with `data-c15t-category`. A banner does not block code loaded elsewhere.',
		'- Gate features on the current permission. Never save a consent choice on page load or from code; only a visitor action records one.',
		'- Offline mode keeps policies in code and choices in the browser, with no consent records. Not recommended for production environments.',
		'- Keep one consent provider or root for the whole app, mounted outside route-level components.',
		'',
		'## Customize with the smallest change',
		'',
		'Copy and languages use i18n configuration. Position and layout use component props. Colors, type, radius and spacing use theme tokens. One part of a component uses slots. Different markup uses compound or headless components.'
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
