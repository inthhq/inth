import fs from 'node:fs/promises';
import path from 'node:path';

import * as p from '@clack/prompts';

import type { CliContext } from '../context/types';
import { CliError } from '../core/errors';
import type { MobileProject, ReactNativeProject } from './detect';
import {
	MOBILE_CATEGORIES,
	planNativeSetup,
	planReactNativeSetup,
} from './scaffold';
import type {
	MobileCategory,
	MobileMode,
	MobileSetupOptions,
	MobileSetupPlan,
	ProjectFiles,
} from './scaffold';

const MODES: readonly MobileMode[] = [
	'hosted',
	'self-hosted',
	'offline',
	'custom',
];
const DEFAULT_CATEGORIES: readonly MobileCategory[] = [
	'necessary',
	'measurement',
	'marketing',
];
const PLACEHOLDER_PRIVACY_URL = 'https://example.com/privacy';

/** Prompts the setup may show. Injectable so tests drive the interactive path. */
export interface MobilePrompts {
	readonly select: (
		message: string,
		options: readonly string[]
	) => Promise<string>;
	readonly text: (message: string, placeholder: string) => Promise<string>;
	readonly multiselect: (
		message: string,
		options: readonly string[],
		initial: readonly string[]
	) => Promise<string[]>;
	readonly confirm: (message: string) => Promise<boolean>;
}

const answered = <Value>(value: Value | symbol): Value => {
	if (p.isCancel(value)) {
		throw new CliError('CANCELLED');
	}
	return value as Value;
};

const clackPrompts: MobilePrompts = {
	confirm: async (message) =>
		answered(await p.confirm({ initialValue: false, message })),
	multiselect: async (message, options, initial) =>
		answered(
			await p.multiselect({
				initialValues: [...initial],
				message,
				options: options.map((value) => ({ label: value, value })),
				required: true,
			})
		),
	select: async (message, options) =>
		answered(
			await p.select({
				message,
				options: options.map((value) => ({ label: value, value })),
			})
		),
	text: async (message, placeholder) =>
		answered(await p.text({ message, placeholder })),
};

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/** An HTTPS URL, or plain HTTP on a loopback host, without a trailing slash. */
const readURL = (value: string, flag: string): string => {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new CliError('FLAG_INVALID', { details: `${flag} must be a URL.` });
	}
	const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
		throw new CliError('FLAG_INVALID', {
			details: `${flag} must use https, or http on a loopback host.`,
		});
	}
	return value.replace(/\/+$/u, '');
};

const readCategories = (values: readonly string[]): MobileCategory[] => {
	const unknown = values.filter(
		(value) => !(MOBILE_CATEGORIES as readonly string[]).includes(value)
	);
	if (unknown.length > 0) {
		throw new CliError('FLAG_INVALID', {
			details: `Unknown categories: ${unknown.join(', ')}. Use ${MOBILE_CATEGORIES.join(', ')}.`,
		});
	}
	// `necessary` is always offered and always first, as the native cores list it.
	return MOBILE_CATEGORIES.filter(
		(category) => category === 'necessary' || values.includes(category)
	);
};

const isInteractive = (context: CliContext): boolean =>
	context.flags['non-interactive'] !== true &&
	context.flags.json !== true &&
	context.flags.yes !== true &&
	process.stdin.isTTY === true;

const resolveMode = async (
	context: CliContext,
	prompts: MobilePrompts | null
): Promise<MobileMode> => {
	let mode = text(context.commandArgs[0]) ?? text(context.flags.mode);
	if (mode === undefined && prompts) {
		mode = await prompts.select('How will the app resolve its policy?', MODES);
	}
	mode ??= 'hosted';
	if (!(MODES as readonly string[]).includes(mode)) {
		throw new CliError('FLAG_INVALID', {
			details: `Mobile setup takes one mode: ${MODES.join(', ')}.`,
		});
	}
	return mode as MobileMode;
};

const resolveBackendURL = async (
	context: CliContext,
	mode: MobileMode,
	prompts: MobilePrompts | null
): Promise<string | undefined> => {
	let backendURL = text(context.flags['backend-url']);
	if (mode === 'offline') {
		if (backendURL !== undefined) {
			throw new CliError('FLAG_INVALID', {
				details: 'Offline mode sends nothing, so it takes no --backend-url.',
			});
		}
		return undefined;
	}
	if (backendURL === undefined && prompts) {
		backendURL = text(
			await prompts.text(
				'Backend URL (your Inth project URL or self-hosted backend)',
				'https://your-project.inth.app'
			)
		);
	}
	if (backendURL === undefined) {
		throw new CliError('INPUT_REQUIRED', {
			details:
				'Pass --backend-url https://your-project.inth.app, the URL the app will use.',
		});
	}
	return readURL(backendURL, '--backend-url');
};

const resolveCategories = async (
	context: CliContext,
	prompts: MobilePrompts | null
): Promise<MobileCategory[]> => {
	const listed = text(context.flags.categories)
		?.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
	if (listed) {
		return readCategories(listed);
	}
	return readCategories(
		prompts
			? await prompts.multiselect(
					'Consent categories the app offers',
					MOBILE_CATEGORIES,
					DEFAULT_CATEGORIES
				)
			: DEFAULT_CATEGORIES
	);
};

const resolveBundleManifest = (
	context: CliContext,
	project: MobileProject,
	mode: MobileMode,
	prompts: MobilePrompts | null
): Promise<boolean> => {
	const canBundle =
		project.kind === 'expo' && (mode === 'hosted' || mode === 'self-hosted');
	if (context.flags['bundle-manifest'] === true) {
		if (!canBundle) {
			throw new CliError('FLAG_INVALID', {
				details:
					'--bundle-manifest needs an Expo app in hosted or self-hosted mode. Other apps run `c15t mobile-manifest` in their build.',
			});
		}
		return Promise.resolve(true);
	}
	return canBundle && prompts
		? prompts.confirm(
				'Bundle the policy at prebuild, so a first launch without network still prompts?'
			)
		: Promise.resolve(false);
};

const resolvePrivacyPolicyURL = async (
	context: CliContext,
	prompts: MobilePrompts | null
): Promise<string> => {
	let url = text(context.flags['privacy-policy-url']);
	if (url === undefined && prompts) {
		url = text(
			await prompts.text('Privacy policy URL', PLACEHOLDER_PRIVACY_URL)
		);
	}
	return url ? readURL(url, '--privacy-policy-url') : PLACEHOLDER_PRIVACY_URL;
};

/**
 * Read the setup answers from flags, then prompts when interactive.
 *
 * @throws {CliError} When an answer is invalid, or required and not given.
 */
export const resolveMobileOptions = async (
	context: CliContext,
	project: MobileProject,
	prompts: MobilePrompts | null
): Promise<MobileSetupOptions> => {
	const mode = await resolveMode(context, prompts);
	const backendURL = await resolveBackendURL(context, mode, prompts);
	const categories = await resolveCategories(context, prompts);
	const bundleManifest = await resolveBundleManifest(
		context,
		project,
		mode,
		prompts
	);
	const privacyPolicyURL = await resolvePrivacyPolicyURL(context, prompts);
	return { backendURL, bundleManifest, categories, mode, privacyPolicyURL };
};

const readIfExists = async (file: string): Promise<string | null> => {
	try {
		return await fs.readFile(file, 'utf8');
	} catch {
		return null;
	}
};

const isDirectory = async (dir: string): Promise<boolean> => {
	try {
		return (await fs.stat(dir)).isDirectory();
	} catch {
		return false;
	}
};

const firstExisting = async (
	root: string,
	candidates: readonly string[]
): Promise<string | null> => {
	for (const candidate of candidates) {
		// oxlint-disable-next-line no-await-in-loop -- The first match wins, in order.
		if ((await readIfExists(path.join(root, candidate))) !== null) {
			return candidate;
		}
	}
	return null;
};

const INSTALL: Record<string, string> = {
	bun: 'bun add',
	npm: 'npm install',
	pnpm: 'pnpm add',
	yarn: 'yarn add',
};

/** Read what the project already has, so the plan never overwrites by accident. */
export const readProjectFiles = async (
	project: ReactNativeProject,
	packageManager: string
): Promise<ProjectFiles> => {
	const { root } = project;
	const hasSrc = await isDirectory(path.join(root, 'src'));
	const provider = `${hasSrc ? 'src/' : ''}c15t/privacy-app.${project.typescript ? 'tsx' : 'jsx'}`;
	const rootComponent =
		(await firstExisting(root, [
			'app/_layout.tsx',
			'app/_layout.jsx',
			'app/_layout.js',
			'src/app/_layout.tsx',
			'App.tsx',
			'App.jsx',
			'App.js',
		])) ?? 'your root component';
	return {
		appJson:
			project.kind === 'expo'
				? await readIfExists(path.join(root, 'app.json'))
				: null,
		dynamicConfig:
			project.kind === 'expo'
				? await firstExisting(root, [
						'app.config.ts',
						'app.config.js',
						'app.config.mjs',
						'app.config.cjs',
					])
				: null,
		hasSrc,
		installCommand: INSTALL[packageManager] ?? 'npm install',
		providerExists: (await readIfExists(path.join(root, provider))) !== null,
		rootComponent,
	};
};

/** What `c15t setup` reports for a mobile project, and returns with `--json`. */
export interface MobileSetupResult extends MobileSetupPlan {
	readonly platform: MobileProject['kind'];
	readonly options: MobileSetupOptions;
	/** `false` for `--dry-run` and `--plan`, which write nothing. */
	readonly applied: boolean;
}

/**
 * `c15t setup` in an Expo, bare React Native, Swift or Android project.
 *
 * @param context - The CLI context.
 * @param project - From `detectMobileProject`.
 * @param prompts - Prompt implementation; `null` disables prompts.
 * @returns The plan and whether it was written.
 */
export const setupMobile = async (
	context: CliContext,
	project: MobileProject,
	prompts: MobilePrompts | null = isInteractive(context) ? clackPrompts : null
): Promise<MobileSetupResult> => {
	const { logger, flags } = context;
	const options = await resolveMobileOptions(context, project, prompts);
	const plan =
		project.kind === 'native'
			? planNativeSetup(project.platforms, options)
			: planReactNativeSetup(
					project,
					options,
					await readProjectFiles(project, context.packageManager.name),
					flags.overwrite === true
				);
	const applied = flags['dry-run'] !== true && flags.plan !== true;
	if (applied) {
		for (const file of plan.files) {
			const target = path.join(project.root, file.path);
			// oxlint-disable-next-line no-await-in-loop -- Writes stay in plan order.
			await fs.mkdir(path.dirname(target), { recursive: true });
			// oxlint-disable-next-line no-await-in-loop -- Writes stay in plan order.
			await fs.writeFile(target, file.contents);
		}
	}
	// Remind only when nobody chose the URL: a flag that names the placeholder is a choice.
	const steps =
		options.privacyPolicyURL === PLACEHOLDER_PRIVACY_URL &&
		text(flags['privacy-policy-url']) === undefined
			? [
					...plan.steps,
					`Replace ${PLACEHOLDER_PRIVACY_URL} with your privacy policy, or rerun with --privacy-policy-url.`,
				]
			: plan.steps;
	if (flags.json !== true) {
		for (const file of plan.files) {
			logger.success(`${applied ? 'Wrote' : 'Would write'} ${file.path}`);
		}
		for (const reason of plan.skipped) {
			logger.warn(reason);
		}
		logger.note(
			steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n'),
			'Next steps'
		);
	}
	return { ...plan, applied, options, platform: project.kind, steps };
};
