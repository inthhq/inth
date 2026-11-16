import { execFileSync, spawnSync } from 'node:child_process';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { createRelease } from './tegami';

const readWorkflow = function readWorkflow(name: string): unknown {
	return JSON.parse(
		execFileSync(
			'bun',
			[
				'-e',
				'console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))',
			],
			{
				encoding: 'utf8',
				input: readFileSync(
					new URL(`../.github/workflows/${name}.yml`, import.meta.url),
					'utf8'
				),
			}
		)
	);
};

describe('release validation', () => {
	it('summarizes coverage against the selected release ancestor', () => {
		expect(readWorkflow('ci')).toMatchObject({
			jobs: {
				packages: {
					steps: expect.arrayContaining([
						expect.objectContaining({
							env: {
								CI_DIFF_BASE: `\${{ needs.repository.outputs.baseRef }}`,
							},
							name: 'Summarize coverage',
						}),
					]),
				},
			},
		});
	});

	it('runs Tegami in the trusted release workflow with provenance and Node 24', () => {
		expect(readWorkflow('ci')).toMatchObject({
			jobs: {
				repository: {
					steps: expect.arrayContaining([
						expect.objectContaining({
							uses: './.github/actions/setup',
							with: expect.objectContaining({ 'node-version': '24' }),
						}),
					]),
				},
			},
		});
		expect(readWorkflow('release')).toMatchObject({
			jobs: {
				publish: {
					steps: expect.arrayContaining([
						expect.objectContaining({
							uses: './.github/actions/setup',
							with: expect.objectContaining({
								built: `\${{ needs.checks.outputs.built }}`,
								'cache-scope': 'publish',
								'node-version': '24',
							}),
						}),
						expect.objectContaining({
							env: {
								GITHUB_TOKEN: `\${{ secrets.GITHUB_TOKEN }}`,
								NPM_CONFIG_PROVENANCE: 'true',
							},
							if: "steps.tip.outputs.current == 'true'",
							run: 'bun run tegami ci',
						}),
					]),
				},
			},
		});
	});
	it('keeps npm trusted publishing on a GitHub-hosted runner', () => {
		expect(readWorkflow('release')).toMatchObject({
			jobs: {
				publish: {
					permissions: { 'id-token': 'write' },
					'runs-on': 'ubuntu-latest',
				},
			},
		});
	});

	it('queues only publishing, so release checks overlap', () => {
		expect(readWorkflow('release')).toMatchObject({
			concurrency: {
				group: `release-run-\${{ github.run_id }}`,
				queue: 'max',
			},
			jobs: {
				publish: {
					concurrency: {
						group: `release-\${{ github.ref }}`,
						queue: 'max',
					},
					needs: 'checks',
					// The tip check runs inside the release group, right before
					// Tegami, so a newer push that lands while this job waits stops it.
					steps: expect.arrayContaining([
						expect.objectContaining({
							id: 'tip',
							name: 'Skip superseded commits',
						}),
					]),
				},
			},
		});
		// A per-ref group here would queue release checks again from inside
		// the reusable workflow.
		expect(readWorkflow('ci')).toMatchObject({
			concurrency: {
				group: `ci-\${{ github.event.pull_request.number || github.run_id }}`,
			},
		});
	});

	it('opens version PRs on main and canary pushes and publishes nothing else', () => {
		const workflow = readWorkflow('release') as {
			jobs: { publish: { steps: { run?: string }[] } };
			on: { push: { branches: string[] } };
		};
		expect(workflow.on.push.branches).toEqual(['main', 'canary']);
		// Every publish goes through a merged version PR, canary included.
		expect(
			workflow.jobs.publish.steps.flatMap((step) =>
				step.run?.includes('tegami') ? [step.run] : []
			)
		).toEqual(['bun run tegami ci']);
	});

	it('requires an explicit manual opt-in to bypass release CI', () => {
		expect(readWorkflow('release')).toMatchObject({
			jobs: { publish: { needs: 'checks' } },
			on: {
				workflow_dispatch: {
					inputs: { skip_tests: { default: false, type: 'boolean' } },
				},
			},
		});
	});

	it.each([
		{ eventName: 'push', skipTests: undefined },
		{ eventName: 'push', skipTests: true },
		{ eventName: 'workflow_dispatch', skipTests: undefined },
		{ eventName: 'workflow_dispatch', skipTests: false },
		{ eventName: 'workflow_dispatch', skipTests: true },
	])(
		'gates $eventName publication with skip_tests=$skipTests',
		({ eventName, skipTests }) => {
			const workflow = readWorkflow('release') as {
				jobs: { checks: { if: string }; publish: { if: string } };
			};
			const bypass = eventName === 'workflow_dispatch' && skipTests === true;
			// These conditions use the same boolean syntax in Actions and JavaScript.
			// A status function prevents Actions from implicitly requiring success()
			// when the checks job was intentionally skipped.
			expect(workflow.jobs.publish.if).toContain('!cancelled()');
			for (const repository of [
				'c15t/c15t',
				'inthhq/c15t-private',
				'fork/c15t',
			]) {
				const github = {
					event_name: eventName,
					ref: 'refs/heads/canary',
					repository,
				};
				const inputs = { skip_tests: skipTests };
				expect(
					runInNewContext(workflow.jobs.checks.if, { github, inputs })
				).toBe(repository !== 'c15t/c15t' || !bypass);
				for (const result of ['success', 'skipped', 'failure', 'cancelled']) {
					for (const cancelled of [false, true]) {
						expect(
							Boolean(
								runInNewContext(workflow.jobs.publish.if, {
									cancelled: () => cancelled,
									github,
									inputs,
									needs: { checks: { result } },
								})
							)
						).toBe(
							!cancelled &&
								repository === 'c15t/c15t' &&
								(result === 'success' || (bypass && result === 'skipped'))
						);
					}
				}
			}
		}
	);

	it('skips runtime comparisons in releases while keeping other checks required', () => {
		expect(readWorkflow('release')).toMatchObject({
			jobs: {
				checks: { with: { skip_mobile_device: true, skip_performance: true } },
				publish: { needs: 'checks' },
			},
		});
		expect(readWorkflow('validation')).not.toHaveProperty(
			'jobs.checks.with.skip_performance'
		);
		expect(readWorkflow('ci')).toMatchObject({
			jobs: {
				complete: {
					needs: [
						'repository',
						'build',
						'packages',
						'backend',
						'browser',
						'mobile',
						'mobileCompatibility',
						'bundle',
						'performance',
					],
				},
				// The device builds are a build report, not a gate: a pod fetch that
				// breaks must not turn `CI complete` red.
				mobileBrowserOrDevice: {
					if: "needs.repository.outputs.mobileBrowserOrDevice == 'true' && !inputs.skip_mobile_device",
					needs: ['repository', 'build'],
					uses: './.github/workflows/mobile-device.yml',
				},
				performance: {
					if: "needs.repository.outputs.performance == 'true' && !inputs.skip_performance",
					with: {
						// A PR that reaches only a gate-only bench (Angular) runs the
						// consent gate without the quick runtime suites.
						mode: `\${{ github.event_name != 'pull_request' && 'full' || (needs.repository.outputs.runtimeBenchmarks == 'true' && 'quick' || 'gate') }}`,
					},
				},
			},
			on: {
				workflow_call: {
					inputs: { skip_performance: { default: false, type: 'boolean' } },
				},
			},
		});
	});

	it('selects canary release checks since a successful ancestor and keeps full validation full', () => {
		expect(readWorkflow('release')).toMatchObject({
			jobs: {
				checks: {
					with: {
						release_affected: `\${{ github.ref == 'refs/heads/canary' }}`,
					},
				},
			},
		});
		expect(readWorkflow('ci')).toMatchObject({
			jobs: {
				repository: {
					steps: expect.arrayContaining([
						expect.objectContaining({
							env: { CI_RELEASE_SELECTION: `\${{ inputs.release_affected }}` },
							id: 'plan',
						}),
					]),
				},
			},
			on: {
				workflow_call: {
					inputs: { release_affected: { default: false, type: 'boolean' } },
				},
			},
		});
		expect(readWorkflow('validation')).not.toHaveProperty(
			'jobs.checks.with.release_affected'
		);
	});

	it('runs advisory app builds independently on release pushes', () => {
		expect(readWorkflow('mobile-device')).toMatchObject({
			jobs: {
				plan: {
					steps: expect.arrayContaining([
						expect.objectContaining({
							env: expect.objectContaining({
								CI_RELEASE_WORKFLOW: 'mobile-device.yml',
							}),
							run: 'bun scripts/ci-release-base.ts',
						}),
					]),
				},
			},
			on: { push: { branches: ['main', 'canary'] } },
		});
		expect(readWorkflow('release')).toMatchObject({
			jobs: { checks: { with: { skip_mobile_device: true } } },
		});
	});

	it('runs full canary comparisons separately on push, nightly, and manually', () => {
		expect(readWorkflow('benchmark-regression')).toMatchObject({
			jobs: {
				benchmark: {
					needs: 'plan',
					steps: expect.arrayContaining([
						expect.objectContaining({
							with: expect.objectContaining({
								ref: `\${{ needs.plan.outputs.head_sha }}`,
							}),
						}),
						expect.objectContaining({
							env: expect.objectContaining({
								BENCHMARK_BASE_REF: `\${{ needs.plan.outputs.base_sha }}`,
								BENCHMARK_MODE: `\${{ matrix.mode }}`,
								BENCHMARK_PACKAGE: `\${{ matrix.package }}`,
								BENCHMARK_SHARD: `\${{ matrix.id }}`,
							}),
							run: 'bun scripts/benchmark-run.ts "$BENCHMARK_MODE"',
						}),
						expect.objectContaining({
							if: `\${{ !cancelled() }}`,
							with: expect.objectContaining({
								name: `runtime-benchmarks-\${{ matrix.id }}`,
							}),
						}),
					]),
					strategy: {
						'fail-fast': false,
						matrix: `\${{ fromJSON(needs.plan.outputs.matrix) }}`,
					},
				},
				plan: {
					steps: expect.arrayContaining([
						expect.objectContaining({
							with: expect.objectContaining({
								ref: `\${{ (github.event_name == 'schedule' || github.event_name == 'workflow_dispatch') && 'canary' || github.sha }}`,
							}),
						}),
						// Pushes and the nightly run carry no inputs, so they measure
						// every consent gate target alongside the full comparison.
						expect.objectContaining({
							env: expect.objectContaining({
								BENCHMARK_GATE_TARGETS: `\${{ inputs.gate_targets || 'all' }}`,
								BENCHMARK_MODE: `\${{ inputs.mode || 'full' }}`,
							}),
						}),
					]),
				},
			},
			on: {
				push: { branches: ['canary'] },
				schedule: [{ cron: '43 2 * * *' }],
				workflow_dispatch: {
					inputs: {
						mode: { default: 'full' },
					},
				},
			},
		});
		expect(readWorkflow('benchmark-regression')).not.toHaveProperty(
			'on.workflow_call.inputs.advisory'
		);
		for (const input of ['head_ref', 'branch']) {
			expect(readWorkflow('benchmark-regression')).not.toHaveProperty(
				`on.workflow_dispatch.inputs.${input}`
			);
		}
		expect(readWorkflow('benchmark-regression')).not.toMatchObject({
			jobs: {
				benchmark: {
					steps: expect.arrayContaining([
						expect.objectContaining({ 'continue-on-error': expect.anything() }),
					]),
				},
			},
		});
	});

	it.each([
		'repository',
		'build',
		'packages',
		'backend',
		'browser',
		'mobile',
		'mobileCompatibility',
		'bundle',
	])(
		'blocks failed or cancelled %s checks when release benchmarks are skipped',
		(job) => {
			const complete = JSON.parse(
				execFileSync(
					'bun',
					[
						'-e',
						'console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text()).jobs.complete))',
					],
					{
						encoding: 'utf8',
						input: readFileSync(
							new URL('../.github/workflows/ci.yml', import.meta.url),
							'utf8'
						),
					}
				)
			);
			for (const result of ['success', 'skipped', 'failure', 'cancelled']) {
				const run = spawnSync('bash', ['-e', '-c', complete.steps[0].run], {
					env: {
						...process.env,
						RESULTS: JSON.stringify(
							Object.fromEntries(
								complete.needs.map((dependency: string) => [
									dependency,
									{ result: dependency === job ? result : 'skipped' },
								])
							)
						),
					},
				});
				expect(run.error).toBeUndefined();
				expect(run.status).toBe(
					['success', 'skipped'].includes(result) ? 0 : 1
				);
			}
		}
	);
});

const workflows = new URL('../.github/workflows/', import.meta.url);
const readPublicationWorkflow = (name: string) =>
	parse(readFileSync(new URL(`${name}.yml`, workflows), 'utf8'));

// GitHub's implicit bash shell omits pipefail; explicit `shell: bash` adds it.
const bashStepArguments = (step: { run: string; shell?: string }) => [
	...(step.shell === 'bash'
		? ['--noprofile', '--norc', '-e', '-o', 'pipefail']
		: ['-e']),
	'-c',
	step.run,
];

// These workflow conditions use boolean operators shared by Actions and JS.
// Translate Actions property syntax; do not copy the guard into the test.
const permits = (
	condition: string | undefined,
	context: Record<string, unknown>
) =>
	Boolean(
		runInNewContext(
			(condition ?? 'true')
				.replaceAll('github.event.pull_request.labels.*.name', 'labels')
				.replaceAll(
					'needs.detect-changed-packages',
					"needs['detect-changed-packages']"
				),
			{
				always: () => true,
				cancelled: () => false,
				contains: (values: string[], value: string) => values.includes(value),
				...context,
			}
		)
	);

const context = (
	repository: string,
	event = 'push',
	ref = 'refs/heads/canary'
) => ({
	github: {
		event: {
			pull_request: {
				author_association: 'MEMBER',
				head: { repo: { full_name: repository } },
			},
		},
		event_name: event,
		ref,
		repository,
	},
	inputs: { skip_tests: true },
	labels: ['deploy:preview'],
	needs: {
		checks: { result: 'success' },
		'detect-changed-packages': {
			outputs: { packages: '["react-native","core"]' },
		},
		'live-vendor-probes': {
			outputs: { report_artifact_id: '123' },
		},
	},
});

describe('workflow publication trust', () => {
	it.each([
		{ command: 'run tegami:mobile publish\n', current: false, lock: true },
		{ command: '', current: false, lock: false },
		{ command: 'run tegami:mobile ci\n', current: true, lock: true },
		{ command: 'run tegami:mobile ci\n', current: true, lock: false },
		{
			command: `scripts/recover-mobile-release.ts ${'a'.repeat(40)}\n`,
			current: false,
			lock: true,
			sourceCommit: 'a'.repeat(40),
		},
		{
			command: `scripts/recover-mobile-release.ts ${'a'.repeat(40)}\n`,
			current: true,
			lock: true,
			sourceCommit: 'a'.repeat(40),
		},
	])(
		'finishes an existing native lock at its exact commit, current $current lock $lock',
		({ current, lock, command, sourceCommit = '' }) => {
			const native = readPublicationWorkflow('release-mobile');
			const publish = native.jobs.release.steps.find(
				(step: { name?: string }) =>
					step.name === 'Version or publish native packages'
			);
			const root = mkdtempSync(join(tmpdir(), 'native-release-tip-'));
			try {
				for (const [name, content] of [
					[
						'git',
						'#!/bin/sh\n[ "$GIT_CONFIG_COUNT" = 1 ] || exit 2\n[ "$GIT_CONFIG_KEY_0" = http.https://github.com/.extraheader ] || exit 2\n[ "$GIT_CONFIG_VALUE_0" = "AUTHORIZATION: basic $EXPECTED_AUTHORIZATION" ] || exit 2\nprintf "%s\\n" "$BRANCH_TIP"\n',
					],
					['bun', '#!/bin/sh\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\n'],
				] as const) {
					writeFileSync(join(root, name), content);
					chmodSync(join(root, name), 0o755);
				}
				if (lock) {
					mkdirSync(join(root, '.tegami/mobile'), { recursive: true });
					writeFileSync(join(root, '.tegami/mobile/publish-lock.yaml'), '');
				}
				const recorded = join(root, 'commands');
				writeFileSync(recorded, '');
				const result = spawnSync('bash', bashStepArguments(publish), {
					cwd: root,
					encoding: 'utf8',
					env: {
						...process.env,
						BRANCH_TIP: current ? 'release-commit' : 'newer-commit',
						COMMAND_LOG: recorded,
						EXPECTED_AUTHORIZATION: Buffer.from(
							'x-access-token:workflow-token-fixture'
						).toString('base64'),
						GITHUB_REF: 'refs/heads/canary',
						GITHUB_SHA: 'release-commit',
						GITHUB_TOKEN: 'workflow-token-fixture',
						NATIVE_SOURCE_COMMIT: sourceCommit,
						PATH: `${root}:${process.env.PATH}`,
						REPOSITORY_URL: 'https://github.com/c15t/c15t',
					},
				});
				expect(result.error).toBeUndefined();
				expect(result.status, result.stderr).toBe(0);
				expect(readFileSync(recorded, 'utf8')).toBe(command);
			} finally {
				rmSync(root, { force: true, recursive: true });
			}
		}
	);

	it('runs native release checks after every release-branch push so the branch tip can finish a pending lock', () => {
		const native = readPublicationWorkflow('release-mobile');
		expect(native.on.push).toEqual({ branches: ['main', 'canary'] });
	});

	it.each([
		{
			attempt: 1,
			confirmed: '3.1.0-canary.2',
			event: 'push',
			expected: '',
			failed: '',
		},
		{
			attempt: 1,
			confirmed: '',
			event: 'workflow_dispatch',
			expected: '',
			failed: '',
		},
		{
			attempt: 1,
			confirmed: '3.1.0-canary.2',
			event: 'workflow_dispatch',
			expected: '3.1.0-canary.2',
			failed: '',
		},
		{
			attempt: 2,
			confirmed: '3.1.0-canary.2',
			event: 'workflow_dispatch',
			expected: '',
			failed: '',
		},
		{
			attempt: 1,
			confirmed: '',
			event: 'workflow_dispatch',
			expected: '3.1.0-canary.2',
			failed: '3.1.0-canary.2',
		},
		{
			attempt: 2,
			confirmed: '',
			event: 'workflow_dispatch',
			expected: '',
			failed: '3.1.0-canary.2',
		},
	])(
		'authorizes a new Maven upload only on a fresh confirmed dispatch, $event attempt $attempt',
		({ event, attempt, confirmed, failed, expected }) => {
			const native = readPublicationWorkflow('release-mobile');
			const publish = native.jobs.release.steps.find(
				(step: { name?: string }) =>
					step.name === 'Version or publish native packages'
			);
			const expression = publish.env.C15T_MAVEN_NEW_UPLOAD_VERSION;
			expect(expression).toBeTypeOf('string');
			const supplied = {
				github: { event_name: event, run_attempt: String(attempt) },
				inputs: {
					discard_failed_maven_version: failed,
					new_maven_upload_version: confirmed,
				},
			};
			expect(runInNewContext(expression.slice(3, -2), supplied)).toBe(expected);
			const discard = native.jobs.release.steps.find(
				(step: { name?: string }) =>
					step.name === 'Discard a failed Central deployment state'
			);
			expect(permits(discard.if, supplied)).toBe(
				event === 'workflow_dispatch' && attempt === 1 && failed !== ''
			);
		}
	);

	it('limits native publisher credentials to the publish and explicit recovery steps', () => {
		const native = readPublicationWorkflow('release-mobile');
		const exposures = Object.entries(native.jobs).flatMap(([id, value]) => {
			const job = value as {
				env?: Record<string, unknown>;
				steps?: { name?: string; env?: Record<string, unknown> }[];
			};
			return [
				...Object.keys(job.env ?? {})
					.filter((name) =>
						/C15T_(?:SWIFT_TOKEN|CENTRAL_|MAVEN_SIGNING_)/u.test(name)
					)
					.map((name) => `${id}/${name}`),
				...(job.steps ?? []).flatMap((step) =>
					Object.keys(step.env ?? {})
						.filter((name) =>
							/C15T_(?:SWIFT_TOKEN|CENTRAL_|MAVEN_SIGNING_)/u.test(name)
						)
						.map((name) => `${step.name}/${name}`)
				),
			];
		});
		expect(exposures.sort()).toEqual([
			'Discard a failed Central deployment state/C15T_CENTRAL_TOKEN',
			'Discard a failed Central deployment state/C15T_CENTRAL_USERNAME',
			'Version or publish native packages/C15T_CENTRAL_TOKEN',
			'Version or publish native packages/C15T_CENTRAL_USERNAME',
			'Version or publish native packages/C15T_MAVEN_SIGNING_KEY',
			'Version or publish native packages/C15T_MAVEN_SIGNING_PASSWORD',
		]);
	});

	it('restores same-repository retry state when a newer fork artifact uses the same branch name', () => {
		const native = readPublicationWorkflow('release-mobile');
		const restore = native.jobs.release.steps.find(
			(step: { name?: string }) => step.name === 'Restore Central retry state'
		);
		const root = mkdtempSync(join(tmpdir(), 'native-release-restore-'));
		try {
			writeFileSync(
				join(root, 'gh'),
				`#!/bin/sh
case "$1:$2" in
  api:*/actions/artifacts*) printf '%s' "$ARTIFACTS_JSON" ;;
  api:*/actions/runs/*) printf '%s' "$RUN_JSON" ;;
  run:download) printf '%s' "$3" > "$RECORDED_DOWNLOAD" ;;
  *) exit 2 ;;
esac
`
			);
			chmodSync(join(root, 'gh'), 0o755);
			const artifact = (id: number, repository: number, created: string) => ({
				created_at: created,
				expired: false,
				workflow_run: {
					head_branch: 'canary',
					head_repository_id: repository,
					id,
				},
			});
			const result = spawnSync('bash', bashStepArguments(restore), {
				encoding: 'utf8',
				env: {
					...process.env,
					ARTIFACTS_JSON: JSON.stringify({
						artifacts: [
							artifact(20, 2, '2026-11-01T02:00:00Z'),
							artifact(10, 1, '2026-11-01T01:00:00Z'),
						],
					}),
					C15T_NATIVE_STATE_DIR: join(root, 'state'),
					GITHUB_REF_NAME: 'canary',
					GITHUB_REPOSITORY: 'c15t/c15t',
					GITHUB_REPOSITORY_ID: '1',
					PATH: `${root}:${process.env.PATH}`,
					PREVIOUS_RUN_ID: '',
					RECORDED_DOWNLOAD: join(root, 'selected'),
					RUN_JSON: JSON.stringify({
						event: 'push',
						head_branch: 'canary',
						head_repository: { full_name: 'c15t/c15t' },
						path: '.github/workflows/release-mobile.yml',
					}),
				},
			});
			expect(result.error).toBeUndefined();
			expect(result.status, result.stderr).toBe(0);
			expect(readFileSync(join(root, 'selected'), 'utf8')).toBe('10');
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
	});

	it.each([0, 1])(
		'retry snapshot eligibility reflects artifact lookup exit %s',
		(exit) => {
			const native = readPublicationWorkflow('release-mobile');
			const restore = native.jobs.release.steps.find(
				(step: { id?: string }) => step.id === 'restore_state'
			);
			const root = mkdtempSync(join(tmpdir(), 'native-release-lookup-'));
			try {
				writeFileSync(
					join(root, 'gh'),
					`#!/bin/sh\nprintf '%s' '{"artifacts":[]}'\nexit ${exit}\n`
				);
				chmodSync(join(root, 'gh'), 0o755);
				const result = spawnSync('bash', bashStepArguments(restore), {
					encoding: 'utf8',
					env: {
						...process.env,
						C15T_NATIVE_STATE_DIR: join(root, 'state'),
						GITHUB_REF_NAME: 'canary',
						GITHUB_REPOSITORY: 'c15t/c15t',
						GITHUB_REPOSITORY_ID: '1',
						PATH: `${root}:${process.env.PATH}`,
						PREVIOUS_RUN_ID: '',
					},
				});
				expect(result.error).toBeUndefined();
				expect(result.status, result.stderr).toBe(exit);
				for (const step of native.jobs.release.steps.filter(
					(candidate: { name?: string }) =>
						candidate.name === 'Remove completed Central retry files' ||
						candidate.name ===
							'Retain Central retry state and the exact signed bundle'
				)) {
					expect(
						permits(step.if, {
							steps: {
								restore_state: {
									outcome: result.status === 0 ? 'success' : 'failure',
								},
							},
						})
					).toBe(exit === 0);
				}
			} finally {
				rmSync(root, { force: true, recursive: true });
			}
		}
	);

	it.each([0, 1])(
		'retains an empty retry snapshot even when cleanup exits %s',
		(exit) => {
			const native = readPublicationWorkflow('release-mobile');
			const cleanup = native.jobs.release.steps.find(
				(step: { name?: string }) =>
					step.name === 'Remove completed Central retry files'
			);
			const upload = native.jobs.release.steps.find(
				(step: { name?: string }) =>
					step.name === 'Retain Central retry state and the exact signed bundle'
			);
			const root = mkdtempSync(join(tmpdir(), 'native-release-retention-'));
			try {
				writeFileSync(join(root, 'bun'), `#!/bin/sh\nexit ${exit}\n`);
				chmodSync(join(root, 'bun'), 0o755);
				const state = join(root, 'state');
				const result = spawnSync('bash', bashStepArguments(cleanup), {
					encoding: 'utf8',
					env: {
						...process.env,
						C15T_NATIVE_STATE_DIR: state,
						GITHUB_RUN_ATTEMPT: '1',
						GITHUB_RUN_ID: '123',
						PATH: `${root}:${process.env.PATH}`,
					},
				});
				expect(result.status, result.stderr).toBe(exit);
				expect(readdirSync(state)).toEqual(['snapshot.txt']);
				expect(readFileSync(join(state, 'snapshot.txt'), 'utf8')).toBe(
					'123:1\n'
				);
				expect(upload.with.path).toContain(
					'/mobile-release-state/snapshot.txt'
				);
				expect(upload.with['if-no-files-found']).toBe('error');
				for (const step of [cleanup, upload]) {
					for (const outcome of ['success', 'failure', 'cancelled']) {
						expect(
							permits(step.if, { steps: { restore_state: { outcome } } })
						).toBe(outcome === 'success');
					}
				}
			} finally {
				rmSync(root, { force: true, recursive: true });
			}
		}
	);

	it('requires successful CI and the protected environment for native publication', () => {
		const native = readPublicationWorkflow('release-mobile');
		expect(native.jobs.release.steps[0].with).toMatchObject({
			'persist-credentials': false,
		});
		expect(native.jobs.release).toMatchObject({
			environment: 'mobile-release',
			needs: 'checks',
			'runs-on': 'macos-15',
		});
		for (const event of ['push', 'workflow_dispatch']) {
			for (const ref of ['refs/heads/main', 'refs/heads/canary']) {
				const supplied = context('c15t/c15t', event, ref);
				expect(permits(native.jobs.release.if, supplied)).toBe(true);
				supplied.needs.checks.result = 'failure';
				expect(permits(native.jobs.release.if, supplied)).toBe(false);
			}
		}
	});

	it('accounts for every workflow job with repository write permission', () => {
		const writers: string[] = [];
		for (const file of readdirSync(workflows).filter((name) =>
			name.endsWith('.yml')
		)) {
			const workflow = readPublicationWorkflow(file.slice(0, -4));
			for (const [id, job] of Object.entries<{
				permissions?: Record<string, string>;
			}>(workflow.jobs)) {
				const permissions = { ...workflow.permissions, ...job.permissions };
				if (
					Object.entries(permissions).some(
						([scope, access]) => scope !== 'id-token' && access === 'write'
					)
				) {
					writers.push(`${file}/${id}`);
				}
			}
		}
		expect(writers.sort()).toEqual([
			'autofix.yml/autofix',
			'pr-preview.yml/deploy-preview',
			'release-mobile.yml/release',
			'release.yml/publish',
			'script-vendor-monitor.yml/sync-monitor-issues',
			'sync-canary.yml/sync',
		]);
	});

	it('keeps React Native private and out of the real Tegami publication graph', async () => {
		const manifest = JSON.parse(
			readFileSync(
				new URL('../packages/react-native/package.json', import.meta.url),
				'utf8'
			)
		);
		expect(manifest.private).toBe(true);
		const { graph } = await createRelease({
			branch: 'canary',
			cwd: new URL('..', import.meta.url).pathname,
			github: false,
		})._internal.context();
		const packages = graph.getPackages().map((pkg) => pkg.name);
		expect(packages).toContain('@c15t/core');
		expect(packages).not.toContain('@c15t/react-native');
	});
	it.each(['inthhq/c15t-private', 'contributor/c15t', '', 'c15t/other'])(
		'blocks publication and inherited write automation in %s',
		(repository) => {
			for (const event of [
				'pull_request',
				'push',
				'pull_request_target',
				'workflow_dispatch',
				'workflow_call',
				'schedule',
				'release',
			]) {
				for (const ref of [
					'refs/heads/main',
					'refs/heads/canary',
					'refs/heads/feature',
					'refs/pull/5/merge',
					'refs/tags/v3.0.0',
				]) {
					const supplied = context(repository, event, ref);
					for (const [workflow, job] of [
						['release', 'publish'],
						['release-mobile', 'release'],
						['pr-preview', 'deploy-preview'],
						['sync-canary', 'sync'],
						['autofix', 'autofix'],
						['pullfrog', 'pullfrog'],
						['script-vendor-monitor', 'sync-monitor-issues'],
					]) {
						expect(
							permits(readPublicationWorkflow(workflow).jobs[job].if, supplied),
							`${workflow}.${job} ${event} ${ref}`
						).toBe(false);
					}
				}
			}
		}
	);

	it('allows public release branches only on push or manual dispatch', () => {
		const { publish } = readPublicationWorkflow('release').jobs;
		for (const event of [
			'workflow_dispatch',
			'push',
			'pull_request',
			'pull_request_target',
			'workflow_call',
			'schedule',
			'release',
		]) {
			for (const ref of [
				'refs/heads/main',
				'refs/heads/canary',
				'refs/heads/feature',
				'refs/tags/v3.0.0',
			]) {
				expect(
					permits(publish.if, context('c15t/c15t', event, ref)),
					`${event} ${ref}`
				).toBe(
					['push', 'workflow_dispatch'].includes(event) &&
						['refs/heads/main', 'refs/heads/canary'].includes(ref)
				);
			}
		}
	});

	it('keeps public previews limited to member or explicitly labelled PRs', () => {
		const deploy = readPublicationWorkflow('pr-preview').jobs['deploy-preview'];
		for (const event of [
			'push',
			'pull_request',
			'workflow_dispatch',
			'workflow_call',
		]) {
			for (const association of [
				'MEMBER',
				'CONTRIBUTOR',
				'FIRST_TIME_CONTRIBUTOR',
			]) {
				for (const labels of [[], ['deploy:preview']]) {
					const supplied = context('c15t/c15t', event, 'refs/pull/5/merge');
					supplied.github.event.pull_request.author_association = association;
					supplied.labels = labels;
					expect(permits(deploy.if, supplied)).toBe(
						event === 'pull_request' &&
							(association === 'MEMBER' || labels.length > 0)
					);
				}
			}
		}
		const empty = context('c15t/c15t', 'pull_request');
		empty.needs['detect-changed-packages'].outputs.packages = '[]';
		expect(permits(deploy.if, empty)).toBe(false);
	});

	it('retains public sync, autofix, manual agents and monitor issue updates', () => {
		for (const [workflow, job, event, ref] of [
			['sync-canary', 'sync', 'push', 'refs/heads/main'],
			['sync-canary', 'sync', 'workflow_dispatch', 'refs/heads/main'],
			['autofix', 'autofix', 'pull_request', 'refs/pull/5/merge'],
			['autofix', 'autofix', 'push', 'refs/heads/main'],
			['pullfrog', 'pullfrog', 'workflow_dispatch', 'refs/heads/canary'],
			[
				'script-vendor-monitor',
				'sync-monitor-issues',
				'schedule',
				'refs/heads/canary',
			],
		]) {
			expect(
				permits(
					readPublicationWorkflow(workflow).jobs[job].if,
					context('c15t/c15t', event, ref)
				)
			).toBe(true);
		}
	});

	it('keeps vendor probes read-only and syncs issues only after a report upload', () => {
		const { jobs } = readPublicationWorkflow('script-vendor-monitor');
		const probes = jobs['live-vendor-probes'];
		const sync = jobs['sync-monitor-issues'];
		expect(probes.permissions).toEqual({ contents: 'read' });
		expect(probes).not.toHaveProperty('if');
		expect(
			probes.steps.every(
				(step: { env?: Record<string, string> }) => !step.env?.GITHUB_TOKEN
			)
		).toBe(true);
		expect(sync.needs).toBe('live-vendor-probes');
		expect(sync.permissions).toEqual({ contents: 'read', issues: 'write' });
		const upload = probes.steps.find(
			(step: { id?: string }) => step.id === 'report'
		);
		const download = sync.steps.find((step: { uses?: string }) =>
			step.uses?.startsWith('actions/download-artifact@')
		);
		expect(upload.if).toBe('always()');
		expect(probes.outputs.report_artifact_id).toBe(
			`\${{ steps.report.outputs.artifact-id }}`
		);
		expect(download.with.name).toBe(upload.with.name);
		expect(download.with.path).toBe('packages/integrations');
		for (const repository of ['c15t/c15t', 'inthhq/c15t-private']) {
			for (const artifact of ['', '123']) {
				const supplied = context(repository, 'schedule');
				supplied.needs['live-vendor-probes'].outputs.report_artifact_id =
					artifact;
				expect(permits(sync.if, supplied)).toBe(
					repository === 'c15t/c15t' && artifact !== ''
				);
			}
		}
	});

	it('keeps private validation available through release, PR, dispatch and reusable CI', () => {
		const { checks } = readPublicationWorkflow('release').jobs;
		for (const event of ['push', 'workflow_dispatch']) {
			expect(permits(checks.if, context('inthhq/c15t-private', event))).toBe(
				true
			);
		}
		const ci = readPublicationWorkflow('ci');
		expect(ci.on).toHaveProperty('pull_request');
		expect(ci.on).toHaveProperty('workflow_dispatch');
		expect(ci.on).toHaveProperty('workflow_call');
		expect(ci.jobs.repository).not.toHaveProperty('if');
		expect(
			readPublicationWorkflow('validation').jobs.checks
		).not.toHaveProperty('if');
	});

	it('keeps reusable workflows read-only and publication outside their call graph', () => {
		const reusable: string[] = [];
		for (const file of readdirSync(workflows).filter((name) =>
			name.endsWith('.yml')
		)) {
			const workflow = readPublicationWorkflow(file.slice(0, -4));
			if (!Object.hasOwn(workflow.on, 'workflow_call')) {
				continue;
			}
			reusable.push(file);
			expect(workflow.permissions).not.toMatchObject({ contents: 'write' });
			for (const job of Object.values<{
				permissions?: Record<string, string>;
				steps?: { run?: string }[];
				uses?: string;
			}>(workflow.jobs)) {
				for (const [scope, access] of Object.entries(job.permissions ?? {})) {
					expect(
						scope === 'id-token' || access === 'read',
						`${file} ${scope}`
					).toBe(true);
				}
				expect(job.uses ?? '').not.toMatch(
					/(?:release|pr-preview|sync-canary)\.yml/u
				);
				for (const step of job.steps ?? []) {
					expect(step.run ?? '').not.toMatch(
						/(?:tegami\s+(?:ci|publish|version)|pkg-pr-new|npm\s+publish|vercel\s+deploy|eas\s+(?:build|submit|update))/u
					);
				}
			}
		}
		expect(reusable.sort()).toEqual([
			'benchmark-regression.yml',
			'bundle-analysis.yml',
			'ci.yml',
			'mobile-app-e2e.yml',
			'mobile-device.yml',
		]);
	});

	it('excludes private packages with public publishConfig from the actual preview detector', () => {
		const root = mkdtempSync(join(tmpdir(), 'c15t-preview-'));
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
		try {
			git('init', '-q');
			git('config', 'user.name', 'Preview fixture');
			git('config', 'user.email', 'fixture@example.invalid');
			git('commit', '--allow-empty', '-qm', 'base');
			const base = git('rev-parse', 'HEAD');
			for (const [name, privateValue] of [
				['react-native', true],
				['invalid-private', 'true'],
				['core', false],
				['legacy', undefined],
			]) {
				mkdirSync(join(root, 'packages', String(name)), { recursive: true });
				writeFileSync(
					join(root, 'packages', String(name), 'package.json'),
					JSON.stringify({
						name,
						private: privateValue,
						publishConfig: name === 'legacy' ? undefined : { access: 'public' },
					})
				);
			}
			git('add', 'packages');
			git('commit', '-qm', 'changed packages');
			const head = git('rev-parse', 'HEAD');
			const step = readPublicationWorkflow('pr-preview').jobs[
				'detect-changed-packages'
			].steps.find((entry: { id?: string }) => entry.id === 'changes');
			const script = step.run
				.replaceAll(`\${{ github.event_name }}`, 'pull_request')
				.replaceAll(`\${{ github.event.pull_request.base.sha }}`, base)
				.replaceAll(`\${{ github.event.pull_request.head.sha }}`, head)
				.replaceAll(`\${{ github.event.before }}`, base)
				.replaceAll(`\${{ github.event.after }}`, head);
			execFileSync('bash', ['-e', '-c', script], {
				cwd: root,
				env: { ...process.env, GITHUB_OUTPUT: join(root, 'output') },
			});
			expect(readFileSync(join(root, 'output'), 'utf8').trim()).toBe(
				'packages=["core","legacy"]'
			);
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
	});
});

describe('mobile CI preparation', () => {
	it('selects the same pinned Xcode in every iOS job', () => {
		interface Job {
			env?: Record<string, string>;
			steps?: { name?: string; run?: string }[];
		}
		const selections = [
			['ci', 'mobile'],
			['mobile-device', 'device'],
			['mobile-app-e2e', 'ios-vendor-sdks'],
			['mobile-app-e2e', 'expo-ios-vendor-sdks'],
		].map(([file, name]) => {
			const job: Job = readPublicationWorkflow(file).jobs[name];
			const step = job.steps?.find(
				(entry) => entry.name === 'Select the pinned Xcode'
			);
			// Comments may differ between copies; the commands may not.
			const commands = step?.run
				?.split('\n')
				.filter((line) => !line.trim().startsWith('#'))
				.join('\n');
			return { run: commands, versions: job.env?.C15T_XCODE_VERSIONS };
		});
		expect(selections[0].run).toContain('C15T_XCODE_VERSIONS');
		for (const selection of selections.slice(1)) {
			expect(selection).toEqual(selections[0]);
		}
	});

	it('fails the Android lane when the Android helper unit suite fails', () => {
		const step = readPublicationWorkflow('ci').jobs.mobile.steps.find(
			(entry: { name?: string }) =>
				entry.name === 'Test the Kotlin core and assemble the Android library'
		);
		const root = mkdtempSync(join(tmpdir(), 'c15t-mobile-gate-'));
		try {
			const directory = join(root, 'native/core-android');
			mkdirSync(directory, { recursive: true });
			const gradlew = join(directory, 'gradlew');
			writeFileSync(
				gradlew,
				'#!/bin/sh\ncase " $* " in *" :c15t-android:testDebugUnitTest "*) exit 42;; esac\n'
			);
			chmodSync(gradlew, 0o755);
			const result = spawnSync('bash', ['-e', '-c', step.run], {
				cwd: root,
				encoding: 'utf8',
			});
			expect(result.status, result.stderr).toBe(42);
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
	});

	it('preserves Swift test failures through evidence logging', () => {
		const step = readPublicationWorkflow('ci').jobs.mobile.steps.find(
			(entry: { name?: string }) =>
				entry.name === 'Build and test the Swift core'
		);
		const root = mkdtempSync(join(tmpdir(), 'c15t-swift-gate-'));
		try {
			const swift = join(root, 'swift');
			writeFileSync(
				swift,
				'#!/bin/sh\nif [ "$1" = test ]; then echo "fixture Swift test failed"; exit 42; fi\n'
			);
			chmodSync(swift, 0o755);
			const result = spawnSync('bash', ['-e', '-c', step.run], {
				cwd: root,
				encoding: 'utf8',
				env: {
					...process.env,
					BENCH_OUTPUT_DIR: join(root, 'reports'),
					PATH: `${root}:${process.env.PATH}`,
				},
			});
			expect(result.status, result.stderr).toBe(42);
			expect(
				readFileSync(join(root, 'reports/swift-core.log'), 'utf8')
			).toContain('fixture Swift test failed');
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
	});
});
