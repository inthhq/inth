import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { valid } from 'semver';

/** Central API and bundle requirements, checked against Sonatype's documentation. */
export const centralDocumentation = [
	'https://central.sonatype.org/publish/publish-portal-api/',
	'https://central.sonatype.org/publish/requirements/',
];

const centralApi = 'https://central.sonatype.com/api/v1/publisher/';
const artifacts = [
	['inth-core', 'jar'],
	['inth-android', 'aar'],
	['inth-consent-ui', 'aar'],
] as const;
const checksumAlgorithms = ['md5', 'sha1', 'sha256', 'sha512'] as const;
const deploymentStates = [
	'PENDING',
	'VALIDATING',
	'VALIDATED',
	'PUBLISHING',
	'PUBLISHED',
	'FAILED',
] as const;
type DeploymentState = (typeof deploymentStates)[number];
type SignatureVerifier = (file: string, signature: string) => void;
type CentralTransport = (url: URL, options: RequestInit) => Promise<Response>;

interface MavenFilesOptions {
	repository: string;
	version: string;
	verifySignature?: SignatureVerifier;
}

interface CentralCredentials {
	username: string;
	token: string;
}

interface MavenDeploymentOptions {
	/** Durable file outside the checkout. Retain it across CI retries. */
	stateFile: string;
	cwd?: string;
	credentials?: CentralCredentials;
	request?: CentralTransport;
	/** Persist this state transition; an absent file means a rejected upload was cleared. */
	onStateSaved?: (stateFile: string) => void | Promise<void>;
}

interface DeploymentRecord {
	version: string;
	bundleSha256: string;
	deploymentId?: string;
}

/** The state returned by Central. Failed validation throws and retains the id. */
export interface MavenDeployment {
	deploymentId: string;
	deploymentState: DeploymentState;
}

const assertVersion = function assertVersion(version: string) {
	if (!valid(version)) {
		throw new Error(
			'A complete native semver is required for Maven publication.'
		);
	}
};

const primaryPaths = function primaryPaths(version: string) {
	assertVersion(version);
	return artifacts.flatMap(([artifact, extension]) => {
		const prefix = `com/inth/${artifact}/${version}/${artifact}-${version}`;
		return [
			`${prefix}.${extension}`,
			`${prefix}-sources.jar`,
			`${prefix}-javadoc.jar`,
			`${prefix}.pom`,
			`${prefix}.module`,
		];
	});
};

const bundlePaths = function bundlePaths(version: string) {
	return primaryPaths(version).flatMap((file) => [
		file,
		`${file}.asc`,
		...checksumAlgorithms.map((algorithm) => `${file}.${algorithm}`),
	]);
};

const digest = function digest(file: string, algorithm: string) {
	return createHash(algorithm).update(readFileSync(file)).digest('hex');
};

/** Verify a detached signature with the signer public key in the GPG keyring. */
export const verifyMavenSignature: SignatureVerifier = (file, signature) => {
	try {
		execFileSync(
			'gpg',
			[
				'--batch',
				'--no-tty',
				'--no-auto-key-retrieve',
				'--verify',
				signature,
				file,
			],
			{ stdio: 'pipe' }
		);
	} catch {
		throw new Error(`Invalid or unverifiable Maven signature: ${signature}`);
	}
};

const verifyPom = function verifyPom(
	file: string,
	artifact: string,
	extension: string,
	version: string
) {
	// ElementTree reads direct coordinates, so dependency versions cannot mask them.
	const program = `import sys, xml.etree.ElementTree as ET
p = ET.parse(sys.argv[1]).getroot()
ns = {'m': 'http://maven.apache.org/POM/4.0.0'}
def text(path):
    return (p.findtext(path, namespaces=ns) or '').strip()
def require(condition, message):
    if not condition:
        raise ValueError(message)
require(text('m:groupId') == 'com.inth', 'groupId')
require(text('m:artifactId') == sys.argv[2], 'artifactId')
require(text('m:version') == sys.argv[3], 'version')
require((text('m:packaging') or 'jar') == sys.argv[4], 'packaging')
for field in ['m:name', 'm:description', 'm:url', 'm:licenses/m:license/m:name', 'm:licenses/m:license/m:url', 'm:developers/m:developer/m:name']:
    require(text(field), field)
require(text('m:scm/m:url') == 'https://github.com/c15t/c15t', 'scm url')
require(text('m:scm/m:connection') == 'scm:git:https://github.com/c15t/c15t.git', 'scm connection')
for dependency in p.findall('m:dependencies/m:dependency', ns):
    if dependency.findtext('m:groupId', namespaces=ns) == 'com.inth':
        require(dependency.findtext('m:version', namespaces=ns) == sys.argv[3], 'dependency version')
`;
	try {
		execFileSync(
			'python3',
			['-c', program, file, artifact, version, extension],
			{
				stdio: 'pipe',
			}
		);
	} catch {
		throw new Error(
			`Invalid Central POM or native dependency version: ${file}`
		);
	}
};

const isRecord = function isRecord(
	value: unknown
): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const verifyModule = function verifyModule(
	file: string,
	artifact: string,
	version: string
) {
	const metadata: unknown = JSON.parse(readFileSync(file, 'utf8'));
	if (
		!isRecord(metadata) ||
		!isRecord(metadata.component) ||
		metadata.component.group !== 'com.inth' ||
		metadata.component.module !== artifact ||
		metadata.component.version !== version ||
		!Array.isArray(metadata.variants)
	) {
		throw new Error(`Invalid native Gradle module coordinates: ${file}`);
	}
	for (const variant of metadata.variants) {
		if (!isRecord(variant)) {
			throw new Error(`Invalid Gradle module variant: ${file}`);
		}
		for (const dependency of Array.isArray(variant.dependencies)
			? variant.dependencies
			: []) {
			if (
				isRecord(dependency) &&
				dependency.group === 'com.inth' &&
				(!isRecord(dependency.version) ||
					dependency.version.requires !== version)
			) {
				throw new Error(`Native Gradle dependency version differs: ${file}`);
			}
		}
	}
};

/**
 * Verify all three native publications, metadata, checksums and PGP signatures.
 * @returns The exact paths to include in the Central bundle, relative to the repository.
 */
export const verifyMavenRepository = function verifyMavenRepository({
	repository,
	version,
	verifySignature = verifyMavenSignature,
}: MavenFilesOptions): string[] {
	const files = bundlePaths(version);
	for (const file of files) {
		const path = join(repository, file);
		if (!lstatSync(path).isFile() || lstatSync(path).size === 0) {
			throw new Error(`Missing or empty Maven publication file: ${file}`);
		}
	}
	for (const file of primaryPaths(version)) {
		const path = join(repository, file);
		for (const algorithm of checksumAlgorithms) {
			if (
				readFileSync(`${path}.${algorithm}`, 'utf8').trim().toLowerCase() !==
				digest(path, algorithm)
			) {
				throw new Error(`Maven ${algorithm} checksum differs: ${file}`);
			}
		}
		verifySignature(path, `${path}.asc`);
	}
	for (const [artifact, extension] of artifacts) {
		const prefix = join(
			repository,
			`com/inth/${artifact}/${version}/${artifact}-${version}`
		);
		verifyPom(`${prefix}.pom`, artifact, extension, version);
		verifyModule(`${prefix}.module`, artifact, version);
	}
	return files.sort();
};

/** Build signed local staging files only. This function never uploads. */
export const stageMavenRelease = function stageMavenRelease({
	cwd = process.cwd(),
	version,
}: {
	cwd?: string;
	version: string;
}) {
	assertVersion(version);
	const project = join(cwd, 'packages/android');
	const declared = readFileSync(
		join(project, 'gradle.properties'),
		'utf8'
	).match(/^inth\.native\.version=(?<version>.+)$/mu)?.groups?.version;
	if (declared !== version) {
		throw new Error(
			'The requested Maven version differs from the native source.'
		);
	}
	execFileSync(
		'sh',
		[
			join(project, 'gradlew'),
			'-p',
			project,
			...artifacts.map(
				([artifact]) => `:${artifact}:publishAllPublicationsToStagingRepository`
			),
			'--no-configuration-cache',
			'--console=plain',
		],
		{
			cwd,
			env: {
				...process.env,
				C15T_MAVEN_CENTRAL: 'true',
				C15T_MAVEN_PUBLISH: 'false',
			},
			stdio: 'inherit',
		}
	);
};

/** Verify staging first, then create a bundle containing only the selected version. */
export const createMavenBundle = function createMavenBundle({
	output,
	...options
}: MavenFilesOptions & { output: string }): string {
	const files = verifyMavenRepository(options);
	const path = resolve(output);
	if (existsSync(path)) {
		throw new Error(
			'The Maven bundle output already exists. Choose a new path.'
		);
	}
	mkdirSync(dirname(path), { recursive: true });
	execFileSync('zip', ['-q', '-X', path, '-@'], {
		cwd: options.repository,
		input: `${files.join('\n')}\n`,
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	return path;
};

/** Recheck an existing ZIP before upload, rejecting unexpected files and paths. */
export const verifyMavenBundle = function verifyMavenBundle({
	bundle,
	version,
	verifySignature,
}: {
	bundle: string;
	version: string;
	verifySignature?: SignatureVerifier;
}) {
	const paths = execFileSync('unzip', ['-Z1', resolve(bundle)], {
		encoding: 'utf8',
	})
		.trim()
		.split('\n');
	const expected = bundlePaths(version).sort();
	if (paths.sort().join('\n') !== expected.join('\n')) {
		throw new Error(
			'The Maven bundle contains missing, duplicate or unexpected files.'
		);
	}
	const directory = mkdtempSync(join(tmpdir(), 'inth-central-verify-'));
	try {
		execFileSync('unzip', ['-qq', resolve(bundle), '-d', directory]);
		verifyMavenRepository({ repository: directory, verifySignature, version });
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
};

const externalStatePath = function externalStatePath(
	stateFile: string,
	cwd = process.cwd()
) {
	const path = resolve(stateFile);
	let ancestor = path;
	while (!existsSync(ancestor)) {
		ancestor = dirname(ancestor);
	}
	const actual = resolve(realpathSync(ancestor), relative(ancestor, path));
	const inside = relative(realpathSync(cwd), actual);
	if (!inside || (!inside.startsWith('../') && !isAbsolute(inside))) {
		throw new Error(
			'Keep the durable Maven deployment state outside the checkout.'
		);
	}
	return path;
};

const isDeploymentId = function isDeploymentId(value: string) {
	return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(value);
};

/** Read a validated retry journal without querying or changing its deployment. */
export const readMavenDeploymentRecord = function readMavenDeploymentRecord(
	options: MavenDeploymentOptions
): DeploymentRecord {
	const value: unknown = JSON.parse(
		readFileSync(externalStatePath(options.stateFile, options.cwd), 'utf8')
	);
	if (
		!isRecord(value) ||
		typeof value.version !== 'string' ||
		typeof value.bundleSha256 !== 'string' ||
		!/^[a-f0-9]{64}$/u.test(value.bundleSha256) ||
		(value.deploymentId !== undefined &&
			(typeof value.deploymentId !== 'string' ||
				!isDeploymentId(value.deploymentId)))
	) {
		throw new Error('Invalid persisted Maven deployment state.');
	}
	assertVersion(value.version);
	const record: DeploymentRecord = {
		bundleSha256: value.bundleSha256,
		version: value.version,
	};
	if (typeof value.deploymentId === 'string') {
		record.deploymentId = value.deploymentId;
	}
	return record;
};

const writeDeployment = function writeDeployment(
	options: MavenDeploymentOptions,
	record: DeploymentRecord,
	initial = false
) {
	const path = externalStatePath(options.stateFile, options.cwd);
	mkdirSync(dirname(path), { mode: 0o700, recursive: true });
	const content = `${JSON.stringify(record, null, 2)}\n`;
	if (initial) {
		// Exclusive creation prevents concurrent workers from uploading twice.
		writeFileSync(path, content, { flag: 'wx', mode: 0o600 });
		return;
	}
	const temporary = `${path}.${process.pid}.tmp`;
	writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
	renameSync(temporary, path);
};

const requireDeploymentId = function requireDeploymentId(
	record: DeploymentRecord
) {
	if (!record.deploymentId) {
		throw new Error(
			'The upload outcome is unknown. Recover its deployment id from Central Portal and resume with --deployment-id. Keep the state file.'
		);
	}
	return record.deploymentId;
};

const centralCredentials = function centralCredentials(
	options: MavenDeploymentOptions
) {
	const credentials = options.credentials ?? {
		token: process.env.C15T_CENTRAL_TOKEN ?? '',
		username: process.env.C15T_CENTRAL_USERNAME ?? '',
	};
	if (!credentials.username || !credentials.token) {
		throw new Error(
			'Set C15T_CENTRAL_USERNAME and C15T_CENTRAL_TOKEN securely.'
		);
	}
	return credentials;
};

class CentralHttpError extends Error {
	readonly status: number;
	constructor(status: number) {
		super(
			`Central request failed with HTTP ${status}. Keep the deployment state for retry.`
		);
		this.status = status;
	}
}

const centralRequest = async function centralRequest(
	options: MavenDeploymentOptions,
	path: string,
	body?: FormData
) {
	const credentials = centralCredentials(options);
	let response: Response;
	try {
		response = await (options.request ?? fetch)(new URL(path, centralApi), {
			body,
			headers: {
				Authorization: `Bearer ${Buffer.from(`${credentials.username}:${credentials.token}`).toString('base64')}`,
			},
			method: 'POST',
			redirect: 'error',
			signal: AbortSignal.timeout(120_000),
		});
	} catch {
		throw new Error(
			'Central request failed. Keep the deployment state for retry.'
		);
	}
	if (!response.ok) {
		throw new CentralHttpError(response.status);
	}
	return response;
};

const readMavenDeploymentStatus = async function readMavenDeploymentStatus(
	options: MavenDeploymentOptions
): Promise<MavenDeployment> {
	const record = readMavenDeploymentRecord(options);
	const id = requireDeploymentId(record);
	const response = await centralRequest(
		options,
		`status?id=${encodeURIComponent(id)}`
	);
	const value: unknown = await response.json();
	const state = isRecord(value) ? value.deploymentState : undefined;
	if (
		!isRecord(value) ||
		value.deploymentId !== id ||
		!deploymentStates.some((candidate) => candidate === state)
	) {
		throw new Error('Central returned an invalid deployment status.');
	}
	const deploymentState = deploymentStates.find(
		(candidate) => candidate === state
	);
	if (!deploymentState) {
		throw new Error('Central returned an invalid deployment status.');
	}
	if (
		['VALIDATED', 'PUBLISHING', 'PUBLISHED'].includes(deploymentState) &&
		(!Array.isArray(value.purls) ||
			value.purls.length !== artifacts.length ||
			!artifacts.every(
				([artifact]) =>
					Array.isArray(value.purls) &&
					value.purls.includes(
						`pkg:maven/com.inth/${artifact}@${record.version}`
					)
			))
	) {
		throw new Error(
			'Central deployment coordinates differ from the saved native release.'
		);
	}
	return { deploymentId: id, deploymentState };
};

/** Check the saved deployment without uploading or publishing anything. */
export const getMavenDeployment = async function getMavenDeployment(
	options: MavenDeploymentOptions
): Promise<MavenDeployment> {
	const deployment = await readMavenDeploymentStatus(options);
	if (deployment.deploymentState === 'FAILED') {
		throw new Error(
			`Central validation failed for deployment ${deployment.deploymentId}. Inspect its Portal errors and keep the state file.`
		);
	}
	return deployment;
};

/** Clear only the selected, terminal FAILED journal so that version can be staged again. */
export const discardFailedMavenDeployment =
	async function discardFailedMavenDeployment(
		options: MavenDeploymentOptions & { version: string }
	): Promise<MavenDeployment> {
		assertVersion(options.version);
		const stateFile = externalStatePath(options.stateFile, options.cwd);
		const before = readFileSync(stateFile, 'utf8');
		const record = readMavenDeploymentRecord(options);
		if (record.version !== options.version) {
			throw new Error(
				'The saved deployment belongs to a different Maven version.'
			);
		}
		const deployment = await readMavenDeploymentStatus(options);
		if (deployment.deploymentState !== 'FAILED') {
			throw new Error(
				'Only a confirmed FAILED Central deployment can be discarded.'
			);
		}
		if (readFileSync(stateFile, 'utf8') !== before) {
			throw new Error(
				'The Maven deployment state changed during recovery. Keep the state file.'
			);
		}
		rmSync(stateFile);
		await options.onStateSaved?.(stateFile);
		return deployment;
	};

/**
 * Upload with USER_MANAGED, or inspect the previously saved deployment on retry.
 * No release request is sent. An uncertain upload must be recovered explicitly.
 */
export const uploadMavenBundle = async function uploadMavenBundle(
	options: MavenDeploymentOptions & {
		bundle: string;
		version: string;
		verifySignature?: SignatureVerifier;
		/** Recover an id from Portal after an interrupted upload response. */
		deploymentId?: string;
	}
): Promise<MavenDeployment> {
	assertVersion(options.version);
	const stateFile = externalStatePath(options.stateFile, options.cwd);
	const hash = digest(options.bundle, 'sha256');
	if (existsSync(stateFile)) {
		const record = readMavenDeploymentRecord(options);
		if (record.version !== options.version || record.bundleSha256 !== hash) {
			throw new Error(
				'The saved deployment belongs to a different Maven bundle.'
			);
		}
		if (!record.deploymentId && options.deploymentId) {
			if (!isDeploymentId(options.deploymentId)) {
				throw new Error('Invalid recovered Central deployment id.');
			}
			writeDeployment(options, {
				...record,
				deploymentId: options.deploymentId,
			});
			await options.onStateSaved?.(stateFile);
		}
		return getMavenDeployment(options);
	}
	if (options.deploymentId) {
		throw new Error(
			'Recover a deployment only with its original saved upload state.'
		);
	}
	centralCredentials(options);
	verifyMavenBundle(options);
	const record = { bundleSha256: hash, version: options.version };
	writeDeployment(options, record, true);
	await options.onStateSaved?.(stateFile);
	const journal = readFileSync(stateFile, 'utf8');
	const body = new FormData();
	body.set(
		'bundle',
		new Blob([readFileSync(options.bundle)], {
			type: 'application/octet-stream',
		}),
		`inth-android-${options.version}.zip`
	);
	let response: Response;
	try {
		response = await centralRequest(
			options,
			`upload?publishingType=USER_MANAGED&name=${encodeURIComponent(`inth-android-${options.version}`)}`,
			body
		);
	} catch (error) {
		if (
			error instanceof CentralHttpError &&
			error.status >= 400 &&
			error.status < 500
		) {
			// A rejected request created no deployment; uncertain network/5xx outcomes retain the journal.
			if (readFileSync(stateFile, 'utf8') !== journal) {
				throw new Error(
					'The rejected Maven upload state changed. Keep the state file.',
					{ cause: error }
				);
			}
			rmSync(stateFile);
			await options.onStateSaved?.(stateFile);
			throw new Error(
				`Central rejected the upload with HTTP ${error.status}. Correct the request and retry; its upload journal was cleared.`,
				{ cause: error }
			);
		}
		throw error;
	}
	const deploymentId = (await response.text()).trim();
	if (!isDeploymentId(deploymentId)) {
		throw new Error(
			'Central returned an invalid deployment id. Keep the upload state and inspect Portal.'
		);
	}
	writeDeployment(options, { ...record, deploymentId });
	await options.onStateSaved?.(stateFile);
	return getMavenDeployment(options);
};

/** Publish only an explicitly selected, previously VALIDATED deployment. */
export const publishMavenDeployment = async function publishMavenDeployment(
	options: MavenDeploymentOptions
): Promise<MavenDeployment> {
	const current = await getMavenDeployment(options);
	if (
		current.deploymentState === 'PUBLISHING' ||
		current.deploymentState === 'PUBLISHED'
	) {
		return current;
	}
	if (current.deploymentState !== 'VALIDATED') {
		throw new Error(
			'Central must report VALIDATED before an explicit publish action.'
		);
	}
	await centralRequest(options, `deployment/${current.deploymentId}`);
	return getMavenDeployment(options);
};

if (import.meta.main) {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			bundle: { type: 'string' },
			'deployment-id': { type: 'string' },
			output: { type: 'string' },
			repository: { type: 'string' },
			'state-file': { type: 'string' },
			version: { type: 'string' },
		},
	});
	const required = (name: keyof typeof values) => {
		const value = values[name];
		if (!value) {
			throw new Error(`Specify --${name}.`);
		}
		return value;
	};
	const [action] = positionals;
	if (action === 'stage') {
		stageMavenRelease({ version: required('version') });
	} else if (action === 'bundle') {
		console.log(
			createMavenBundle({
				output: required('output'),
				repository: required('repository'),
				version: required('version'),
			})
		);
	} else if (action === 'upload') {
		console.log(
			JSON.stringify(
				await uploadMavenBundle({
					bundle: required('bundle'),
					deploymentId: values['deployment-id'],
					stateFile: required('state-file'),
					version: required('version'),
				})
			)
		);
	} else if (action === 'discard-failed') {
		console.log(
			JSON.stringify(
				await discardFailedMavenDeployment({
					stateFile: required('state-file'),
					version: required('version'),
				})
			)
		);
	} else if (action === 'status' || action === 'publish') {
		console.log(
			JSON.stringify(
				await (
					action === 'status' ? getMavenDeployment : publishMavenDeployment
				)({ stateFile: required('state-file') })
			)
		);
	} else {
		throw new Error(
			'Choose stage, bundle, upload, status, explicit publish or discard-failed.'
		);
	}
}
