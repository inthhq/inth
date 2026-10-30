import { frameworkGuides } from './package-skill';

const frameworkEntryPoints = [
	['frameworks/next/quickstart.md', 'Next.js quickstart'],
	['frameworks/next/app-router.md', 'App Router setup'],
	['frameworks/next/pages-router.md', 'Pages Router setup'],
	['frameworks/next/static-export.md', 'Static export setup'],
	['frameworks/tanstack-start/quickstart.md', 'TanStack Start quickstart'],
	['frameworks/react/quickstart.md', 'React quickstart'],
	['frameworks/nuxt/quickstart.md', 'Nuxt quickstart'],
	['frameworks/vue/quickstart.md', 'Vue quickstart'],
	['frameworks/astro/quickstart.md', 'Astro quickstart'],
	['frameworks/svelte/quickstart.md', 'Svelte quickstart'],
	['frameworks/sveltekit/quickstart.md', 'SvelteKit quickstart'],
	['frameworks/html/quickstart.md', 'HTML quickstart'],
	['frameworks/javascript/quickstart.md', 'JavaScript quickstart'],
	[
		'frameworks/react-native/quickstart.md',
		'Mobile quickstart and distribution limits',
	],
	['frameworks/react-native/expo.md', 'Expo and EAS setup'],
	['frameworks/react-native/bare.md', 'Bare React Native setup'],
	['frameworks/react-native/apple.md', 'Standalone Apple setup'],
	['frameworks/react-native/android.md', 'Standalone Android setup'],
] as const;

/** Add setup links that survive each package's filtered documentation bundle. */
export const withPackageSetupLinks = function withPackageSetupLinks(
	originalContent: string,
	bundledFiles: ReadonlySet<string>
): string {
	let content = originalContent;
	if (bundledFiles.has('frameworks/react-native/quickstart.md')) {
		content = content.replace(
			/## Using these docs\n\n[\s\S]*?(?=\n## )/u,
			'## Using these docs\n\nThis mobile SDK is a private prerelease. Start with the matching native setup, install one engine before optional SDKs and JavaScript, and check durable local commit results separately from delivery. Registry, cloud-build, device and certification gates remain separate.\n'
		);
	}
	const candidates = bundledFiles.has('frameworks/index.md')
		? [['frameworks/index.md', 'Choose your framework']]
		: frameworkEntryPoints;
	const setup = [
		...candidates,
		['self-host/quickstart.md', 'Backend quickstart'],
		['cli/quickstart.md', 'CLI quickstart'],
	].filter(([file]) => file && bundledFiles.has(file));
	if (setup.length === 0 && bundledFiles.has('integrations/overview.md')) {
		setup.push(['integrations/overview.md', 'Connect your integrations']);
	}
	const heading = '## Start here\n\n';
	const startHere = content.split(heading)[1]?.split('\n## ')[0] ?? '';
	const links = setup
		.filter(([file]) => !startHere.includes(`(./docs/${file})`))
		.map(([file, label]) => `- [${label}](./docs/${file})`)
		.join('\n');
	if (!links) {
		return content;
	}
	if (!content.includes(heading)) {
		// leadtype drops the section when none of its configured links survive
		// the bundle filter; recreate it before the trailing documentation links.
		const more = '\n## More documentation\n';
		const section = `${heading}${links}\n`;
		return content.includes(more)
			? content.replace(more, `\n${section}${more}`)
			: `${content.trimEnd()}\n\n${section}`;
	}
	return content.replace(heading, `${heading}${links}\n`);
};

const frameworkLabels = new Map<string, string>([
	...frameworkGuides,
	['react-native', 'React Native'],
]);
const frameworkOrder = [...frameworkLabels.keys()];
const frameworkEntry = /^- \[[^\]]*\]\(\.\/docs\/frameworks\/(?<dir>[^/)]+)\//u;

/**
 * Groups the Frameworks index under one heading per framework when a bundle
 * holds more than one. Every framework has pages such as Callbacks or
 * Customize, so a flat list repeats the same titles with nothing to tell
 * them apart.
 */
export const withFrameworkGroups = function withFrameworkGroups(
	content: string
): string {
	const heading = '\n## Frameworks\n';
	const start = content.indexOf(heading);
	if (start === -1) {
		return content;
	}
	const bodyStart = start + heading.length;
	const next = content.indexOf('\n## ', bodyStart);
	const bodyEnd = next === -1 ? content.length : next;
	const lines = content.slice(bodyStart, bodyEnd).split('\n');
	const shared: string[] = [];
	const groups = new Map<string, string[]>();
	for (const line of lines) {
		const dir = line.match(frameworkEntry)?.groups?.dir;
		if (dir) {
			groups.set(dir, [...(groups.get(dir) ?? []), line]);
		} else if (line.trim() !== '') {
			shared.push(line);
		}
	}
	if (groups.size < 2) {
		return content;
	}
	const rank = (dir: string) => {
		const index = frameworkOrder.indexOf(dir);
		return index === -1 ? frameworkOrder.length : index;
	};
	const sections = [...groups.keys()]
		.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
		.map(
			(dir) =>
				`### ${frameworkLabels.get(dir) ?? dir}\n\n${(groups.get(dir) ?? []).join('\n')}`
		);
	const body = [shared.length > 0 ? shared.join('\n') : '', ...sections]
		.filter(Boolean)
		.join('\n\n');
	return `${content.slice(0, bodyStart)}\n${body}\n${content.slice(bodyEnd)}`;
};
