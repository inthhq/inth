#!/usr/bin/env tsx

import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const { log } = console;
const { error } = console;

/**
 * Clones the private docs template (consentdotio/inth-docs) into `.docs`,
 * installs its dependencies and processes the MDX content.
 *
 * By default it reads CONSENT_GIT_TOKEN from `.env` for local development.
 * With `--vercel` it reads the token from the environment and leaves the
 * build to Vercel. `--branch=<name>` picks the template branch (default
 * `main`).
 */

type FileSystemPath = string;

type GitHubToken = string;

type ShellCommand = string;

type OperationDescription = string;

type BuildMode = 'development' | 'production';

type GitBranch = string;

interface FetchConfiguration {
	readonly TEMP_DOCS_DIR: FileSystemPath;
	readonly DOCS_APP_DIR: FileSystemPath;
	readonly DOCS_REPO_URL: string;
	readonly DEFAULT_BRANCH: GitBranch;
}

interface FetchOptions {
	readonly isProduction: boolean;
	readonly mode: BuildMode;
	readonly branch: GitBranch;
}

class FetchScriptError extends Error {
	readonly step: string;
	readonly command?: string;
	readonly mode: BuildMode;
	readonly branch: GitBranch;

	constructor(
		message: string,
		step: string,
		mode: BuildMode,
		branch: GitBranch,
		command?: string
	) {
		super(message);
		this.name = 'FetchScriptError';
		this.step = step;
		this.mode = mode;
		this.branch = branch;
		this.command = command;
	}
}

const FETCH_CONFIG: FetchConfiguration = {
	DEFAULT_BRANCH: 'main',
	DOCS_APP_DIR: '.docs',
	DOCS_REPO_URL: 'https://github.com/consentdotio/inth-docs.git',
	TEMP_DOCS_DIR: join(tmpdir(), 'inth-docs'),
} as const;

const parseFetchOptions = function parseFetchOptions(): FetchOptions {
	const isProduction = process.argv.includes('--vercel');

	let branch = FETCH_CONFIG.DEFAULT_BRANCH;
	const branchFlag = process.argv.find((arg) => arg.startsWith('--branch'));

	if (branchFlag) {
		if (branchFlag.includes('=')) {
			// oxlint-disable-next-line prefer-destructuring -- Preserve declaration order, interface shape, and public compatibility.
			branch = branchFlag.split('=')[1];
		} else {
			const branchIndex = process.argv.indexOf(branchFlag);
			if (branchIndex !== -1 && branchIndex + 1 < process.argv.length) {
				branch = process.argv[branchIndex + 1];
			}
		}
	}

	return {
		branch: branch || FETCH_CONFIG.DEFAULT_BRANCH,
		isProduction,
		mode: (() => {
			if (isProduction) {
				return 'production';
			}
			return 'development';
		})(),
	};
};

const validateGitHubToken = function validateGitHubToken(
	buildMode: BuildMode,
	branch: GitBranch
): GitHubToken {
	let token: string | undefined;

	if (buildMode === 'development') {
		try {
			process.loadEnvFile();
			token = process.env.CONSENT_GIT_TOKEN;
		} catch {
			throw new FetchScriptError(
				'Failed to load .env file. Ensure .env exists with CONSENT_GIT_TOKEN',
				'token_validation',
				buildMode,
				branch
			);
		}
	} else {
		token = process.env.CONSENT_GIT_TOKEN;
	}

	if (!token || token.trim() === '') {
		const advisory =
			'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens';
		const msg =
			buildMode === 'production'
				? `CONSENT_GIT_TOKEN missing. Set it in the environment. ${advisory}`
				: `CONSENT_GIT_TOKEN missing. Add it to your .env file. ${advisory}`;
		throw new FetchScriptError(msg, 'token_validation', buildMode, branch);
	}

	log(
		`✅ GitHub token found, proceeding with ${buildMode} build (${branch} branch)...`
	);
	return token;
};

const cleanupDirectory = function cleanupDirectory(
	directoryPath: FileSystemPath,
	description: OperationDescription,
	buildMode: BuildMode,
	branch: GitBranch
): void {
	if (existsSync(directoryPath)) {
		log(`🧹 Cleaning up existing ${description} at ${directoryPath}`);

		try {
			rmSync(directoryPath, { force: true, recursive: true });
		} catch {
			throw new FetchScriptError(
				`Failed to clean up directory: ${directoryPath}`,
				'cleanup',
				buildMode,
				branch,
				`rmSync(${directoryPath})`
			);
		}
	}
};

const executeCommand = function executeCommand(
	command: ShellCommand,
	description: OperationDescription,
	buildMode: BuildMode,
	branch: GitBranch,
	options?: { redact?: string[]; silent?: boolean }
): void {
	const toRedact = options?.redact ?? [];
	const sanitized = toRedact.reduce(
		(cmd, secret) => (secret ? cmd.split(secret).join('***') : cmd),
		command
	);
	log(`🔄 ${description}...`);
	if (!options?.silent) {
		log(`   Running: ${sanitized}`);
	}

	try {
		execSync(command, { stdio: 'inherit' });
		log(`✅ ${description} completed successfully`);
	} catch {
		error(`❌ Failed during: ${description}`);
		if (!options?.silent) {
			error(`   Command: ${sanitized}`);
		}

		throw new FetchScriptError(
			`Command execution failed: ${description}`,
			'command_execution',
			buildMode,
			branch,
			sanitized
		);
	}
};

const cloneDocumentationRepository = function cloneDocumentationRepository(
	authenticationToken: GitHubToken,
	buildMode: BuildMode,
	branch: GitBranch
): void {
	const repoUrl = 'https://github.com/consentdotio/inth-docs.git';
	const basicAuth = Buffer.from(
		`x-access-token:${authenticationToken}`
	).toString('base64');

	cleanupDirectory(
		FETCH_CONFIG.TEMP_DOCS_DIR,
		'temporary docs directory',
		buildMode,
		branch
	);

	executeCommand(
		`git -c http.extraheader="Authorization: Basic ${basicAuth}" clone --depth=1 --branch=${branch} "${repoUrl}" ${FETCH_CONFIG.TEMP_DOCS_DIR}`,
		`Fetching private Next.js documentation template (${branch} branch)`,
		buildMode,
		branch,
		{ redact: [authenticationToken, basicAuth] }
	);
};

const installDocumentationTemplate = function installDocumentationTemplate(
	buildMode: BuildMode,
	branch: GitBranch
): void {
	cleanupDirectory(
		FETCH_CONFIG.DOCS_APP_DIR,
		'existing docs app directory',
		buildMode,
		branch
	);

	executeCommand(
		'true',
		'Installing documentation template into workspace',
		buildMode,
		branch,
		{ silent: true }
	);
	try {
		log('Installing documentation template into workspace...');
		cpSync(FETCH_CONFIG.TEMP_DOCS_DIR, FETCH_CONFIG.DOCS_APP_DIR, {
			recursive: true,
		});
		log('✅ Installation completed successfully');
	} catch {
		throw new FetchScriptError(
			`Failed to copy template from ${FETCH_CONFIG.TEMP_DOCS_DIR} to ${FETCH_CONFIG.DOCS_APP_DIR}`,
			'install_template',
			buildMode,
			branch
		);
	}
};

const processMDXContent = function processMDXContent(
	buildMode: BuildMode,
	branch: GitBranch
): void {
	executeCommand(
		`cd ${FETCH_CONFIG.DOCS_APP_DIR} && pnpm copy-content`,
		'Copying MDX content with copy-content',
		buildMode,
		branch
	);
	executeCommand(
		`cd ${FETCH_CONFIG.DOCS_APP_DIR} && pnpm fumadocs-mdx`,
		'Processing MDX content with fumadocs-mdx',
		buildMode,
		branch
	);
};

const installDocsAppDependencies = function installDocsAppDependencies(
	buildMode: BuildMode,
	branch: GitBranch
): void {
	executeCommand(
		`cd ${FETCH_CONFIG.DOCS_APP_DIR} && pnpm install --ignore-workspace --frozen-lockfile`,
		'Installing .docs dependencies in isolation',
		buildMode,
		branch
	);
};

const main = function main(fetchOptions: FetchOptions): void {
	let modeEmoji: string;
	let modeText: string;
	if (fetchOptions.isProduction) {
		modeEmoji = '🚀';
		modeText = 'production build';
	} else {
		modeEmoji = '⚡';
		modeText = 'development setup';
	}

	log(
		`${modeEmoji} Starting ${modeText} for documentation site (${fetchOptions.branch} branch)...\n`
	);

	try {
		const githubAuthenticationToken = validateGitHubToken(
			fetchOptions.mode,
			fetchOptions.branch
		);

		cloneDocumentationRepository(
			githubAuthenticationToken,
			fetchOptions.mode,
			fetchOptions.branch
		);

		installDocumentationTemplate(fetchOptions.mode, fetchOptions.branch);

		installDocsAppDependencies(fetchOptions.mode, fetchOptions.branch);
		processMDXContent(fetchOptions.mode, fetchOptions.branch);

		if (fetchOptions.isProduction) {
			log('🛑 Skipping local build in production mode; Vercel will build.');
		}

		log(`\n🎉 ${modeText} completed successfully!`);
		log(`📋 Branch: ${fetchOptions.branch}`);

		if (fetchOptions.isProduction) {
			log('📦 Documentation site prepared; Vercel will perform the build.');
		} else {
			log('📂 Ready for local development!');
			log('🚀 Run "cd .docs && pnpm dev" to start the development server');
		}
	} catch (fetchError) {
		error(`\n💥 ${modeText} failed:`, fetchError);

		if (fetchError instanceof FetchScriptError) {
			error(`Fetch step: ${fetchError.step}`);
			error(`Build mode: ${fetchError.mode}`);
			error(`Branch: ${fetchError.branch}`);
			if (fetchError.command) {
				error(`Failed command: ${fetchError.command}`);
			}
		}

		exit(1);
	}
};

if (
	process.argv[1] &&
	fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
	const fetchOptions = parseFetchOptions();
	main(fetchOptions);
}
