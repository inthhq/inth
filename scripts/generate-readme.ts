import * as fssync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SUPPORT_SECTIONS = [
	'Join our [Discord community](https://c15t.link/discord)',
	'Open an issue on our [GitHub repository](https://github.com/inthhq/inth/issues)',
	'Visit [inth.com](https://inth.com) and use the chat widget',
	'Contact our support team via email [support@inth.com](mailto:support@inth.com)',
];

const DEFAULT_CONTRIBUTING_SECTIONS = [
	'Read the [contribution guidelines](https://c15t.com/docs/oss/contributing) before you open a pull request',
	'Follow the [code of conduct](https://c15t.com/docs/oss/code-of-conduct)',
];

const DEFAULT_SECURITY_SECTION = `## Security

Do not open a public issue for a security vulnerability. Report it privately through [GitHub's vulnerability reporting](https://github.com/inthhq/inth/security/advisories/new). We examine every valid report.

- Do not share the vulnerability in public forums, issues, or pull requests
- Give the steps to reproduce it and the versions it affects
- Give us time to release a fix before you disclose it`;

/**
 * Renders the shared hosting section with Inth links tagged for one package.
 *
 * @param npmBadgeName - URL-encoded package name used as the UTM content.
 */
const renderHostingSection = (npmBadgeName: string) => `## Hosting

[Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=${npmBadgeName}) keeps your policies and consent records. You get policy storage, consent records, audit history, and a dashboard, with no database or server to run. Sign-up is free. Set the project URL from your Inth dashboard as \`projectUrl\`.

For local development, previews, and tests, \`testing()\` keeps choices in the browser and sends no consent records. It throws in production builds.`;

interface PackageReadmeConfig {
	packageName: string;
	title: string;
	description: string;
	features?: string[];
	prerequisites?: string[];
	installation?: string[];
	manualInstallation?: string[];
	// items may include fenced code blocks as strings beginning with ```
	usage?: string[];
	commands?: {
		name: string;
		description: string;
	}[];
	globalFlags?: {
		flag: string;
		description: string;
	}[];
	telemetry?: {
		description: string;
		details?: string[];
		disableMethods?: string[];
	};
	support?: string[];
	contributing?: string[];
	security?: string;
	docsLink?: string;
	quickStartLink?: string;
	showCLIGeneration?: boolean;
	customSections?: Record<string, string>;
	/** Sections rendered directly after Key Features, before setup steps. */
	leadSections?: Record<string, string>;
	/**
	 * Renders the shared Hosting section: `'lead'` places it after Key
	 * Features, `true` places it after Usage.
	 */
	showHosting?: boolean | 'lead';
	/** Set from package.json: true when the published tarball includes AGENTS.md. */
	shipsAgentDocs?: boolean;
	/** Set from package.json: private packages have no public npm version badge. */
	privatePackage?: boolean;
}

const isNonEmpty = (v?: string) => Boolean(v && v.trim().length > 0);

const encodeNpmName = (name: string) => encodeURIComponent(name);

const INTH_ICON_LOGO =
	'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8+PHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg==';

const INTH_BADGE_QUERY = new URLSearchParams({
	color: 'ffc803',
	labelTextColor: '000000',
	logo: INTH_ICON_LOGO,
	valueColor: '000000',
}).toString();

/** Appends a ShieldCN color mode query parameter to a badge URL. */
const withBadgeMode = (url: string, mode: 'light' | 'dark'): string => {
	const separator = url.includes('?') ? '&' : '?';
	return `${url}${separator}mode=${mode}`;
};

/**
 * Renders a badge link that switches image sources with the user's color scheme.
 *
 * @param badge.src - Base ShieldCN badge image URL before color mode is added.
 */
const renderThemeAwareBadge = ({
	alt,
	href,
	src,
}: {
	alt: string;
	href: string;
	src: string;
}): string =>
	`<a href="${href}"><picture><source media="(prefers-color-scheme: dark)" srcset="${withBadgeMode(src, 'dark')}"><img src="${withBadgeMode(src, 'light')}" alt="${alt}"></picture></a>`;
const renderNumberedWithCodeBlocks = (items: string[]) => {
	let i = 1;
	const lines: string[] = [];
	for (const raw of items) {
		const item = raw.trim();
		if (item.startsWith('```')) {
			lines.push('');
			lines.push(item);
			lines.push('');
		} else if (item.startsWith('- ')) {
			if (lines.length === 0 || lines[lines.length - 1] !== '') {
				lines.push('');
			}
			lines.push(`${i}. ${item.slice(2)}`);
			i += 1;
			lines.push('');
		} else {
			lines.push(`${i}. ${item}`);
			i += 1;
		}
	}
	return `${lines
		.join('\n')
		.replace(/\n{3,}/gu, '\n\n')
		.trim()}\n\n\n\n`;
};

const addSection = (
	header: string,
	content: string[] | undefined,
	formatter: (item: string, index?: number) => string = (item) => `- ${item}`
) => {
	if (!content || content.length === 0) {
		return '';
	}
	const body = content.map(formatter).join('\n');
	return `${header}\n\n\n\n\n${body}\n\n\n\n`
		.replace(/\n{3,}/gu, '\n\n')
		.trim();
};

// oxlint-disable-next-line complexity -- Preserve established branch order and control flow.
const baseReadmeTemplate = (rawConfig: PackageReadmeConfig) => {
	const config: PackageReadmeConfig = { ...rawConfig };

	if (!config.support || config.support.length === 0) {
		config.support = DEFAULT_SUPPORT_SECTIONS;
	}
	if (!config.contributing || config.contributing.length === 0) {
		config.contributing = DEFAULT_CONTRIBUTING_SECTIONS;
	}
	if (!isNonEmpty(config.security)) {
		config.security = DEFAULT_SECURITY_SECTION;
	}

	const npmBadgeName = encodeNpmName(config.packageName);
	const npmPackageLink = `https://www.npmjs.com/package/${config.packageName}`;
	const madeByInthBadgeUrl = `https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?${INTH_BADGE_QUERY}`;
	const badgeBlock = `<p>
${[
	...(config.privatePackage
		? []
		: [
				renderThemeAwareBadge({
					alt: 'Latest NPM Version',
					href: npmPackageLink,
					src: `https://shieldcn.dev/npm/${npmBadgeName}.svg?variant=outline`,
				}),
			]),
	renderThemeAwareBadge({
		alt: 'Stars',
		href: 'https://github.com/inthhq/inth',
		src: 'https://shieldcn.dev/github/inthhq/inth/stars.svg?variant=outline',
	}),
	renderThemeAwareBadge({
		alt: 'License',
		href: 'https://github.com/inthhq/inth/blob/main/LICENSE',
		src: 'https://shieldcn.dev/github/inthhq/inth/license.svg?variant=outline',
	}),
	renderThemeAwareBadge({
		alt: 'Discord',
		href: 'https://c15t.link/discord',
		src: 'https://shieldcn.dev/discord/1312171102268690493.svg?variant=outline',
	}),
	renderThemeAwareBadge({
		alt: 'Made by Inth',
		href: `https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=${npmBadgeName}`,
		src: madeByInthBadgeUrl,
	}),
].join('\n')}
</p>`;

	// A published @inth package opens with what it is and its install line.
	const plainOpening =
		config.packageName.startsWith('@inth/') && !config.privatePackage;
	const bannerBlock = plainOpening
		? `# ${config.packageName}`
		: `# ${config.title}

${badgeBlock}`;
	const installLine = plainOpening
		? `\`\`\`bash\npnpm add ${config.packageName}\n\`\`\``
		: '';

	let featuresBlock = '';
	if (config.features && config.features.length > 0) {
		featuresBlock = `## Key Features

${config.features.map((f) => `- ${f}`).join('\n')}`;
	}

	const prerequisitesBlock = addSection(
		'## Prerequisites',
		config.prerequisites
	);

	let quickStartBlock = '';
	if (config.showCLIGeneration) {
		quickStartBlock = `## Quick Start

Easiest setup with @inth/cli:

\`\`\`bash
# Set up Inth in your project
pnpm dlx @inth/cli c15t
# Alternatives:
# npx @inth/cli c15t
# bunx --bun @inth/cli c15t
\`\`\`

The CLI will:

- Install necessary packages
- Configure your Inth instance
- Set up environment variables
- Add consent management components to your app
`;
	}

	const manualInstallationBlock = config.manualInstallation?.length
		? `## ${config.showCLIGeneration ? 'Manual Installation' : 'Installation'}

${config.manualInstallation.map((step) => `${step}`).join('\n')}`
		: '';

	const installationBlock = config.installation?.length
		? `## Installation

${config.installation.map((step) => `${step}`).join('\n')}`
		: '';

	let usageBlock = '';
	if (config.usage && config.usage.length > 0) {
		usageBlock = `## Usage

${renderNumberedWithCodeBlocks(config.usage)}`;
	}

	let commandsBlock = '';
	if (config.commands && config.commands.length > 0) {
		commandsBlock = `## Available Commands

${config.commands.map((cmd) => `- \`${cmd.name}\`: ${cmd.description}`).join('\n')}`;
	}

	let globalFlagsBlock = '';
	if (config.globalFlags && config.globalFlags.length > 0) {
		globalFlagsBlock = `## Global Flags

${config.globalFlags.map((flag) => `- \`${flag.flag}\`: ${flag.description}`).join('\n')}`;
	}

	let telemetryBlock = '';
	if (config.telemetry) {
		let detailsSection = '';
		if (config.telemetry.details && config.telemetry.details.length > 0) {
			detailsSection = config.telemetry.details
				.map((detail) => `- ${detail}`)
				.join('\n');
		}

		let disableMethodsSection = '';
		if (
			config.telemetry.disableMethods &&
			config.telemetry.disableMethods.length > 0
		) {
			disableMethodsSection = `Disable telemetry by:

${config.telemetry.disableMethods.map((method) => `- ${method}`).join('\n')}`;
		}

		telemetryBlock = `## Telemetry

${config.telemetry.description}

${detailsSection}

${disableMethodsSection}`;
	}

	let docsBlock = '';
	if (config.docsLink) {
		docsBlock = `## Documentation

See the [documentation](${config.docsLink}) for guides, API reference, and examples.`;
	}

	let leadSectionsBlock = '';
	if (config.leadSections) {
		leadSectionsBlock = Object.entries(config.leadSections)
			.map(([heading, content]) => `## ${heading}\n\n${content}`)
			.join('\n\n');
	}

	let agentDocsBlock = '';
	if (config.shipsAgentDocs) {
		agentDocsBlock = `## Docs for AI Agents

This package ships its documentation as Markdown, matched to the installed version. After you install it, point your coding agent at \`node_modules/${config.packageName}/AGENTS.md\`. It indexes every guide in \`node_modules/${config.packageName}/docs/\`.

On the web, every page of the [Inth docs](https://c15t.com/docs) has a Markdown version, and [llms.txt](https://c15t.com/docs/llms.txt) lists them all. Install the c15t agent skills with \`npx skills add c15t/skills\`.`;
	}

	const hostingBlock = config.showHosting
		? renderHostingSection(npmBadgeName)
		: '';

	let customSectionsBlock = '';
	if (config.customSections) {
		customSectionsBlock = Object.entries(config.customSections)
			.map(([heading, content]) => `## ${heading}\n\n${content}`)
			.join('\n\n');
	}

	const supportBlock = addSection('## Support', config.support);
	const contributingBlock = addSection('## Contributing', config.contributing);

	const licenseBlock = `## License

[Apache License 2.0](https://github.com/inthhq/inth/blob/main/LICENSE)

---

**Built by [Inth](https://inth.com?utm_source=npm&utm_medium=readme&utm_campaign=oss_readme&utm_content=${npmBadgeName})**`;

	const readmeContent = [
		bannerBlock,
		config.description,
		installLine,
		featuresBlock,
		leadSectionsBlock,
		config.showHosting === 'lead' ? hostingBlock : '',
		prerequisitesBlock,
		quickStartBlock,
		manualInstallationBlock,
		installationBlock,
		usageBlock,
		config.showHosting === true ? hostingBlock : '',
		commandsBlock,
		globalFlagsBlock,
		telemetryBlock,
		docsBlock,
		customSectionsBlock,
		agentDocsBlock,
		supportBlock,
		contributingBlock,
		config.security || DEFAULT_SECURITY_SECTION,
		licenseBlock,
	]
		.filter((section) => isNonEmpty(section))
		.join('\n\n')
		.replace(/\n{3,}/gu, '\n\n')
		.replace(/\n{2,}$/u, '\n');

	return `${readmeContent.trim()}\n`;
};

/** Generates README files for all packages with readme.json configurations. */
const generateReadmes = async function generateReadmes() {
	// The web packages sit in packages/sdk. React Native sits beside that folder.
	const packagesDir = path.resolve(__dirname, '../packages/sdk');

	if (!fssync.existsSync(packagesDir)) {
		console.error(`Packages directory not found at ${packagesDir}`);
		process.exit(1);
	}

	const entries = await fs.readdir(packagesDir, { withFileTypes: true });
	const packageDirs = [
		...entries
			.filter((d) => d.isDirectory())
			.map((d) => path.join(packagesDir, d.name)),
		path.resolve(__dirname, '../packages/react-native'),
	].filter((dir) => fssync.existsSync(path.join(dir, 'readme.json')));

	await packageDirs.reduce<Promise<void>>(async (previous, packageDir) => {
		await previous;
		const packageName = path.basename(packageDir);
		try {
			const readmeConfigPath = path.join(packageDir, 'readme.json');
			const packageJsonPath = path.join(packageDir, 'package.json');

			const raw = await fs.readFile(readmeConfigPath, 'utf8');
			const readmeConfig = JSON.parse(raw) as PackageReadmeConfig;

			const packageJson = JSON.parse(
				await fs.readFile(packageJsonPath, 'utf8')
			);

			readmeConfig.packageName = packageJson.name || packageName;
			readmeConfig.privatePackage = packageJson.private === true;

			readmeConfig.shipsAgentDocs = Array.isArray(packageJson.files)
				? packageJson.files.includes('AGENTS.md')
				: false;

			if (!readmeConfig.description) {
				readmeConfig.description = packageJson.description || '';
			}

			const content = baseReadmeTemplate(readmeConfig);
			const readmePath = path.join(packageDir, 'README.md');

			await fs.writeFile(readmePath, content, 'utf8');
			console.log(`Generated README for ${packageName}`);
		} catch (error) {
			console.error(`Error generating README for ${packageName}:`, error);
		}
	}, Promise.resolve());
};

try {
	await generateReadmes();
} catch (error) {
	console.error('Fatal error generating READMEs:', error);
	process.exit(1);
}
