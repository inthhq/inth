import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import {
	createMavenBundle,
	discardFailedMavenDeployment,
	getMavenDeployment,
	publishMavenDeployment,
	uploadMavenBundle,
	verifyMavenBundle,
	verifyMavenRepository,
} from './publish-maven';

const version = '3.0.0-canary.2';
const deploymentId = '28570f16-da32-4c14-bd2e-c1acc0782365';
const modules = [
	['inth-core', 'jar'],
	['inth-android', 'aar'],
	['inth-consent-ui', 'aar'],
] as const;
let root: string;
let keyring: string;
let repository: string;
let checkout: string;
let stateFile: string;
let bundle: string;
let fixture: string;

const seal = (file: string) => {
	for (const algorithm of ['md5', 'sha1', 'sha256', 'sha512']) {
		writeFileSync(
			`${file}.${algorithm}`,
			createHash(algorithm).update(readFileSync(file)).digest('hex')
		);
	}
	execFileSync(
		'gpg',
		[
			'--homedir',
			keyring,
			'--batch',
			'--yes',
			'--pinentry-mode',
			'loopback',
			'--passphrase',
			'',
			'--armor',
			'--detach-sign',
			file,
		],
		{ stdio: 'pipe' }
	);
};

const modulePath = (artifact: string, suffix: string) =>
	join(
		repository,
		`com/inth/${artifact}/${version}/${artifact}-${version}${suffix}`
	);

const status = (state = 'VALIDATED') =>
	new Response(
		JSON.stringify({
			deploymentId,
			deploymentState: state,
			purls: modules.map(
				([artifact]) => `pkg:maven/com.inth/${artifact}@${version}`
			),
		})
	);

const options = () => ({
	bundle,
	credentials: { token: 'fixture-token', username: 'fixture-user' },
	cwd: checkout,
	stateFile,
	version,
});

const saveDeployment = (overrides: Record<string, unknown> = {}) => {
	mkdirSync(dirname(stateFile), { recursive: true });
	writeFileSync(
		stateFile,
		JSON.stringify({
			bundleSha256: 'a'.repeat(64),
			deploymentId,
			version,
			...overrides,
		})
	);
};

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'c15t-maven-test-'));
	keyring = join(root, 'keyring');
	mkdirSync(keyring, { mode: 0o700 });
	vi.stubEnv('GNUPGHOME', keyring);
	execFileSync(
		'gpg',
		[
			'--homedir',
			keyring,
			'--batch',
			'--pinentry-mode',
			'loopback',
			'--passphrase',
			'',
			'--quick-generate-key',
			'Maven fixture <maven@example.invalid>',
			'ed25519',
			'sign',
			'0',
		],
		{ stdio: 'pipe' }
	);
	fixture = join(root, 'signed-fixture');
	const archiveSource = join(root, 'archive-source');
	mkdirSync(archiveSource);
	writeFileSync(join(archiveSource, 'README.md'), 'Fixture artifact.');
	const archivePath = join(root, 'fixture.jar');
	execFileSync('zip', ['-q', '-X', archivePath, 'README.md'], {
		cwd: archiveSource,
	});
	const archive = readFileSync(archivePath);
	for (const [artifact, extension] of modules) {
		const prefix = join(
			fixture,
			`com/inth/${artifact}/${version}/${artifact}-${version}`
		);
		mkdirSync(dirname(prefix), { recursive: true });
		const files: [string, string | Buffer][] = [
			[`.${extension}`, archive],
			['-sources.jar', archive],
			['-javadoc.jar', archive],
			[
				'.pom',
				`<project xmlns="http://maven.apache.org/POM/4.0.0">
<modelVersion>4.0.0</modelVersion><groupId>com.inth</groupId>
<artifactId>${artifact}</artifactId><version>${version}</version><packaging>${extension}</packaging>
<name>${artifact}</name><description>Consent SDK</description><url>https://c15t.com</url>
<licenses><license><name>Apache 2.0</name><url>https://www.apache.org/licenses/LICENSE-2.0.txt</url></license></licenses>
<developers><developer><name>c15t</name></developer></developers>
<scm><url>https://github.com/c15t/c15t</url><connection>scm:git:https://github.com/c15t/c15t.git</connection></scm>
<dependencies><dependency><groupId>com.inth</groupId><artifactId>inth-core</artifactId><version>${version}</version></dependency></dependencies>
</project>`,
			],
			[
				'.module',
				JSON.stringify({
					component: { group: 'com.inth', module: artifact, version },
					variants: [
						{
							dependencies: [
								{
									group: 'com.inth',
									module: 'inth-core',
									version: { requires: version },
								},
							],
						},
					],
				}),
			],
		];
		for (const [suffix, content] of files) {
			const file = `${prefix}${suffix}`;
			writeFileSync(file, content);
			seal(file);
		}
	}
});

beforeEach(() => {
	const run = mkdtempSync(join(root, 'run-'));
	checkout = join(run, 'checkout');
	repository = join(checkout, 'staging');
	cpSync(fixture, repository, { recursive: true });
	stateFile = join(run, 'durable-state', 'deployment.json');
	bundle = join(run, 'central.zip');
});

afterAll(() => {
	vi.unstubAllEnvs();
	if (root) {
		execFileSync('gpgconf', ['--homedir', keyring, '--kill', 'gpg-agent']);
		rmSync(root, { force: true, recursive: true });
	}
});

test('verifies actual signatures and checksums, then ZIPs only the selected native version', () => {
	const files = verifyMavenRepository({ repository, version });
	expect(files).toHaveLength(90);
	writeFileSync(
		join(repository, 'maven-metadata.xml'),
		'Excluded repository history'
	);
	createMavenBundle({ output: bundle, repository, version });
	expect(() => verifyMavenBundle({ bundle, version })).not.toThrow();
	expect(
		execFileSync('unzip', ['-Z1', bundle], { encoding: 'utf8' })
			.trim()
			.split('\n')
	).toEqual(files);
});

test('rejects a corrupted checksum before bundling', () => {
	writeFileSync(modulePath('inth-core', '.jar.sha256'), '0'.repeat(64));
	expect(() =>
		createMavenBundle({ output: bundle, repository, version })
	).toThrow(/sha256 checksum differs/u);
	expect(existsSync(bundle)).toBe(false);
});

test('rejects invalid detached signatures', () => {
	writeFileSync(
		modulePath('inth-android', '.aar.asc'),
		'invalid PGP signature'
	);
	expect(() => verifyMavenRepository({ repository, version })).toThrow(
		/unverifiable Maven signature/u
	);
});

test('rejects unexpected ZIP entries before extracting or uploading', () => {
	createMavenBundle({ output: bundle, repository, version });
	writeFileSync(join(repository, 'unexpected.txt'), 'Not part of this release');
	execFileSync('zip', ['-q', bundle, 'unexpected.txt'], { cwd: repository });
	expect(() => verifyMavenBundle({ bundle, version })).toThrow(
		/missing, duplicate or unexpected files/u
	);
});

/**
 * Each run re-signs three files and verifies the repository twice, which is 33 gpg
 * processes and 4 Python ones: about 0.5 s alone and 1.3 to 2.2 s inside the full
 * file on a busy machine. A shared CI runner once took more than 5 s for it. The
 * budget below leaves room for that without hiding a hang.
 */
const SIGNED_METADATA_TIMEOUT_MS = 20_000;

test.each(['0', '1'])(
	'rejects signed private POM metadata and native dependency version drift with PYTHONOPTIMIZE=%s',
	(optimization) => {
		const previous = process.env.PYTHONOPTIMIZE;
		process.env.PYTHONOPTIMIZE = optimization;
		try {
			const pom = modulePath('inth-android', '.pom');
			const original = readFileSync(pom, 'utf8');
			writeFileSync(
				pom,
				original.replaceAll(
					'github.com/c15t/c15t',
					'github.com/inthhq/c15t-private'
				)
			);
			seal(pom);
			expect(() => verifyMavenRepository({ repository, version })).toThrow(
				/Invalid Central POM/u
			);
			writeFileSync(pom, original);
			seal(pom);
			const metadata = modulePath('inth-android', '.module');
			writeFileSync(
				metadata,
				readFileSync(metadata, 'utf8').replace(
					'"requires":"3.0.0-canary.2"',
					'"requires":"3.0.0-canary.1"'
				)
			);
			seal(metadata);
			expect(() => verifyMavenRepository({ repository, version })).toThrow(
				/dependency version differs/u
			);
		} finally {
			if (previous === undefined) {
				delete process.env.PYTHONOPTIMIZE;
			} else {
				process.env.PYTHONOPTIMIZE = previous;
			}
		}
	},
	SIGNED_METADATA_TIMEOUT_MS
);

test('uploads USER_MANAGED, persists the id before status, and resumes without a second upload', async () => {
	createMavenBundle({ output: bundle, repository, version });
	const requests: string[] = [];
	const saved: string[] = [];
	const request = vi
		.fn((url: URL, init: RequestInit) => {
			requests.push(url.pathname);
			expect(init.method).toBe('POST');
			expect(init.redirect).toBe('error');
			expect(new Headers(init.headers).get('Authorization')).toBe(
				`Bearer ${Buffer.from('fixture-user:fixture-token').toString('base64')}`
			);
			expect(url.searchParams.get('id')).toBe(deploymentId);
			expect(saved).toEqual(['started', deploymentId]);
			return Promise.resolve(status());
		})
		.mockImplementationOnce(async (url: URL, init: RequestInit) => {
			requests.push(url.pathname);
			expect(saved).toEqual(['started']);
			expect(url.searchParams.get('publishingType')).toBe('USER_MANAGED');
			expect(init.body).toBeInstanceOf(FormData);
			if (!(init.body instanceof FormData)) {
				throw new Error('Expected multipart form');
			}
			const part = init.body.get('bundle');
			expect(part).toBeInstanceOf(Blob);
			if (!(part instanceof Blob)) {
				throw new Error('Expected bundle file');
			}
			expect(part.type).toBe('application/octet-stream');
			expect(Buffer.from(await part.arrayBuffer())).toEqual(
				readFileSync(bundle)
			);
			return new Response(deploymentId, { status: 201 });
		});
	const onStateSaved = (path: string) => {
		const record = JSON.parse(readFileSync(path, 'utf8'));
		saved.push(record.deploymentId ?? 'started');
	};
	const input = { ...options(), onStateSaved, request };
	expect(await uploadMavenBundle(input)).toEqual({
		deploymentId,
		deploymentState: 'VALIDATED',
	});
	expect(await uploadMavenBundle(input)).toEqual({
		deploymentId,
		deploymentState: 'VALIDATED',
	});
	expect(requests.filter((path) => path.endsWith('/upload'))).toHaveLength(1);
	expect(requests.some((path) => path.includes('/deployment/'))).toBe(false);
	expect(readFileSync(stateFile, 'utf8')).not.toContain('fixture-token');
});

test('retains a failed deployment until explicit recovery confirms FAILED, then permits a new upload', async () => {
	createMavenBundle({ output: bundle, repository, version });
	const bytes = readFileSync(bundle);
	const request = vi
		.fn()
		.mockResolvedValueOnce(new Response(deploymentId, { status: 201 }))
		.mockResolvedValueOnce(status('FAILED'))
		.mockResolvedValueOnce(status('FAILED'))
		.mockResolvedValueOnce(new Response(deploymentId, { status: 201 }))
		.mockResolvedValueOnce(status());
	const input = { ...options(), request };
	await expect(uploadMavenBundle(input)).rejects.toThrow(
		/Central validation failed/u
	);
	expect(readFileSync(stateFile, 'utf8')).toContain(deploymentId);
	await expect(discardFailedMavenDeployment(input)).resolves.toEqual({
		deploymentId,
		deploymentState: 'FAILED',
	});
	expect(existsSync(stateFile)).toBe(false);
	expect(readFileSync(bundle)).toEqual(bytes);
	await expect(uploadMavenBundle(input)).resolves.toEqual({
		deploymentId,
		deploymentState: 'VALIDATED',
	});
	expect(request).toHaveBeenCalledTimes(5);
});

test.each(['PENDING', 'VALIDATING', 'VALIDATED', 'PUBLISHING', 'PUBLISHED'])(
	'refuses to discard a Central %s deployment',
	async (deploymentState) => {
		saveDeployment();
		const before = readFileSync(stateFile, 'utf8');
		const request = vi.fn().mockResolvedValue(status(deploymentState));
		await expect(
			discardFailedMavenDeployment({ ...options(), request })
		).rejects.toThrow(/Only a confirmed FAILED/u);
		expect(readFileSync(stateFile, 'utf8')).toBe(before);
		expect(request.mock.calls.map(([url]) => url.pathname)).toEqual([
			'/api/v1/publisher/status',
		]);
	}
);

test.each([
	['invalid semver', 'not-a-version', {}],
	['different version', '3.0.0-canary.1', {}],
	['unknown upload outcome', version, { deploymentId: undefined }],
] as const)(
	'refuses discard for %s before any Central request',
	async (_description, selectedVersion, record) => {
		saveDeployment(record);
		const before = readFileSync(stateFile, 'utf8');
		const request = vi.fn();
		await expect(
			discardFailedMavenDeployment({
				...options(),
				request,
				version: selectedVersion,
			})
		).rejects.toThrow();
		expect(request).not.toHaveBeenCalled();
		expect(readFileSync(stateFile, 'utf8')).toBe(before);
	}
);

test('refuses to discard a changed journal or a foreign Central deployment', async () => {
	saveDeployment();
	const request = vi.fn().mockResolvedValue(
		new Response(
			JSON.stringify({
				deploymentId: '12345678-1234-1234-1234-123456789abc',
				deploymentState: 'FAILED',
			})
		)
	);
	const input = { ...options(), request };
	await expect(discardFailedMavenDeployment(input)).rejects.toThrow(
		/invalid deployment status/u
	);
	const replacement = 'b'.repeat(64);
	request.mockImplementationOnce(() => {
		saveDeployment({ bundleSha256: replacement });
		return Promise.resolve(status('FAILED'));
	});
	await expect(discardFailedMavenDeployment(input)).rejects.toThrow(
		/changed during recovery/u
	);
	expect(JSON.parse(readFileSync(stateFile, 'utf8')).bundleSha256).toBe(
		replacement
	);
});

test('blocks duplicate uploads after an ambiguous response and permits explicit id recovery', async () => {
	createMavenBundle({ output: bundle, repository, version });
	const request = vi
		.fn()
		.mockRejectedValueOnce(
			new Error('fixture-token must never appear in output')
		)
		.mockResolvedValue(status());
	const input = { ...options(), request };
	await expect(uploadMavenBundle(input)).rejects.toThrow(
		'Central request failed. Keep the deployment state for retry.'
	);
	await expect(uploadMavenBundle(input)).rejects.toThrow(
		/upload outcome is unknown/u
	);
	expect(request).toHaveBeenCalledTimes(1);
	await expect(uploadMavenBundle({ ...input, deploymentId })).resolves.toEqual({
		deploymentId,
		deploymentState: 'VALIDATED',
	});
	expect(request).toHaveBeenCalledTimes(2);
});

test.each([400, 401, 403, 422])(
	'clears a rejected HTTP %s upload journal and permits corrected credentials to retry',
	async (code) => {
		createMavenBundle({ output: bundle, repository, version });
		const request = vi
			.fn()
			.mockResolvedValueOnce(new Response('Rejected', { status: code }))
			.mockResolvedValueOnce(new Response(deploymentId, { status: 201 }))
			.mockResolvedValueOnce(status());
		const transitions: boolean[] = [];
		const input = {
			...options(),
			onStateSaved: (path: string) => {
				transitions.push(existsSync(path));
			},
			request,
		};
		await expect(uploadMavenBundle(input)).rejects.toThrow(`HTTP ${code}`);
		expect(existsSync(stateFile)).toBe(false);
		expect(transitions).toEqual([true, false]);
		await expect(uploadMavenBundle(input)).resolves.toEqual({
			deploymentId,
			deploymentState: 'VALIDATED',
		});
		expect(request).toHaveBeenCalledTimes(3);
		expect(transitions).toEqual([true, false, true, true]);
	}
);

test('preserves an unknown upload journal after HTTP 503 and never uploads it again', async () => {
	createMavenBundle({ output: bundle, repository, version });
	const request = vi
		.fn()
		.mockResolvedValue(new Response('Unavailable', { status: 503 }));
	const input = { ...options(), request };
	await expect(uploadMavenBundle(input)).rejects.toThrow('HTTP 503');
	const before = readFileSync(stateFile, 'utf8');
	await expect(uploadMavenBundle(input)).rejects.toThrow(
		/upload outcome is unknown/u
	);
	expect(readFileSync(stateFile, 'utf8')).toBe(before);
	expect(request).toHaveBeenCalledOnce();
});

test('requires explicit publish after validation and skips deployments already publishing', async () => {
	createMavenBundle({ output: bundle, repository, version });
	const request = vi
		.fn()
		.mockResolvedValueOnce(new Response(deploymentId, { status: 201 }))
		.mockResolvedValueOnce(status('VALIDATING'))
		.mockResolvedValueOnce(status('VALIDATING'))
		.mockResolvedValueOnce(status())
		.mockResolvedValueOnce(new Response(null, { status: 204 }))
		.mockResolvedValueOnce(status('PUBLISHING'))
		.mockResolvedValueOnce(status('PUBLISHED'));
	const input = { ...options(), request };
	expect(await uploadMavenBundle(input)).toEqual({
		deploymentId,
		deploymentState: 'VALIDATING',
	});
	await expect(publishMavenDeployment(input)).rejects.toThrow(
		/must report VALIDATED/u
	);
	expect(await publishMavenDeployment(input)).toEqual({
		deploymentId,
		deploymentState: 'PUBLISHING',
	});
	expect(await publishMavenDeployment(input)).toEqual({
		deploymentId,
		deploymentState: 'PUBLISHED',
	});
	const publishCalls = request.mock.calls.filter(([url]) =>
		url.pathname.endsWith(`/deployment/${deploymentId}`)
	);
	expect(publishCalls).toHaveLength(1);
});

test('rejects checkout state paths, changed bundles, and recovered deployments with different coordinates', async () => {
	createMavenBundle({ output: bundle, repository, version });
	const request = vi
		.fn()
		.mockResolvedValueOnce(new Response(deploymentId, { status: 201 }))
		.mockResolvedValueOnce(status())
		.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					deploymentId,
					deploymentState: 'VALIDATED',
					purls: [],
				})
			)
		);
	const input = { ...options(), request };
	await expect(
		uploadMavenBundle({ ...input, stateFile: join(checkout, 'state.json') })
	).rejects.toThrow(/outside the checkout/u);
	expect(request).not.toHaveBeenCalled();
	await uploadMavenBundle(input);
	writeFileSync(bundle, 'Changed bundle');
	await expect(uploadMavenBundle(input)).rejects.toThrow(
		/different Maven bundle/u
	);
	await expect(getMavenDeployment(input)).rejects.toThrow(
		/coordinates differ/u
	);
});

test('retains the id when an explicit publish request fails and resumes from Central status', async () => {
	createMavenBundle({ output: bundle, repository, version });
	const request = vi
		.fn()
		.mockResolvedValueOnce(new Response(deploymentId, { status: 201 }))
		.mockResolvedValueOnce(status())
		.mockResolvedValueOnce(status())
		.mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
		.mockResolvedValueOnce(status('PUBLISHED'));
	const input = { ...options(), request };
	await uploadMavenBundle(input);
	await expect(publishMavenDeployment(input)).rejects.toThrow(/HTTP 503/u);
	expect(readFileSync(stateFile, 'utf8')).toContain(deploymentId);
	await expect(publishMavenDeployment(input)).resolves.toEqual({
		deploymentId,
		deploymentState: 'PUBLISHED',
	});
});
