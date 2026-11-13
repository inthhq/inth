import { afterEach, describe, expect, it, vi } from 'vitest';

import { WITH_POLICY, applyToFixture, gradleFile, runMod } from './helpers';

const repository = {
	credentials: {
		passwordEnvironmentVariable: 'PILOT_MAVEN_TOKEN',
		usernameEnvironmentVariable: 'PILOT_MAVEN_USER',
	},
	url: "https://maven.example.com/pilot's/$sdk",
};

const apply = async (androidMavenRepository = repository, contents = '') => {
	const config = applyToFixture({
		androidMavenRepository,
		backendURL: 'https://acme.inth.app',
	});
	const result = await runMod(config, 'android', 'projectBuildGradle', {
		...gradleFile('project-build.gradle'),
		contents,
	});
	return (result.modResults as { contents: string }).contents;
};

describe('Android Maven repository mod', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('keeps credential values out of generated Gradle and runtime config', async () => {
		vi.stubEnv('PILOT_MAVEN_USER', 'c15t-user-sentinel');
		vi.stubEnv('PILOT_MAVEN_TOKEN', 'c15t-token-sentinel');
		const output = await apply();
		expect(output).not.toContain('c15t-user-sentinel');
		expect(output).not.toContain('c15t-token-sentinel');
		const config = applyToFixture({
			androidMavenRepository: repository,
			...WITH_POLICY,
		});
		expect(config.extra?.c15t).not.toHaveProperty('androidMavenRepository');
	});

	it('removes its block when the option is removed and has no default repository', async () => {
		const config = applyToFixture(WITH_POLICY);
		const first = await apply();
		const result = await runMod(config, 'android', 'projectBuildGradle', {
			...gradleFile('project-build.gradle'),
			contents: first,
		});
		expect(result.modResults).toMatchObject({ contents: '' });
	});

	it('refuses to write Groovy repository syntax into a Kotlin DSL root', async () => {
		const config = applyToFixture({
			androidMavenRepository: repository,
			...WITH_POLICY,
		});
		await expect(
			runMod(
				config,
				'android',
				'projectBuildGradle',
				gradleFile('project-build.gradle', 'kt')
			)
		).rejects.toThrow(/Groovy/u);
	});

	it('writes exclusive routing and reads credential names during Gradle configuration', async () => {
		const output = await apply();
		expect(output).toContain('exclusiveContent');
		expect(output).toContain("filter { includeGroup('com.c15t') }");
		expect(output).toContain("pilot\\'s/$sdk");
		expect(output).toContain("System.getenv('PILOT_MAVEN_USER')");
		expect(output).toContain("System.getenv('PILOT_MAVEN_TOKEN')");
		expect(output).not.toContain('maven.pkg.github.com');
	});

	it('replaces its block on reconfiguration and is idempotent', async () => {
		const first = await apply();
		expect(await apply(repository, first)).toBe(first);
		const changed = await apply(
			{ ...repository, url: 'https://maven.example.com/new' },
			first
		);
		expect(changed).not.toContain("pilot\\'s");
		expect(changed.match(/exclusiveContent/gu)).toHaveLength(1);
	});

	it.each([
		'http://maven.example.com/repo',
		'https://user:secret@maven.example.com/repo',
		'https://maven.example.com/repo?token=secret',
		'https://maven.example.com/repo#secret',
		'file://remote/share',
		'not-a-url',
		'https://maven.example.com/\nrepo',
	])('rejects unsafe URL %s without echoing credentials', async (url) => {
		await expect(apply({ ...repository, url })).rejects.toThrow(
			/androidMavenRepository.url/u
		);
		await expect(apply({ ...repository, url })).rejects.not.toThrow(/secret/u);
	});

	it('accepts explicit local staging without credentials', async () => {
		const config = applyToFixture({
			androidMavenRepository: { url: 'file:///tmp/c15t-staging' },
			...WITH_POLICY,
		});
		const result = await runMod(
			config,
			'android',
			'projectBuildGradle',
			gradleFile('project-build.gradle')
		);
		expect(result.modResults).toMatchObject({
			contents: expect.stringContaining('file:///tmp/c15t-staging'),
		});
		expect(result.modResults).toMatchObject({
			contents: expect.not.stringContaining('credentials {'),
		});
		expect(config.extra?.c15t).not.toHaveProperty('androidMavenRepository');
	});

	it.each([
		{ password: 'secret', username: 'literal' },
		{
			passwordEnvironmentVariable: "TOKEN'); throw new Exception('oops",
			usernameEnvironmentVariable: 'USER',
		},
		{ usernameEnvironmentVariable: 'USER' },
	])(
		'rejects literal credentials and invalid environment variable names %j',
		async (credentials) => {
			await expect(
				apply({ ...repository, credentials } as never)
			).rejects.toThrow(/environment variable/u);
		}
	);
});
