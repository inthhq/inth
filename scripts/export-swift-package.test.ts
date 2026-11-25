import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { exportSwiftPackage } from './export-swift-package';

const nativeRoot = 'packages/swift';
const sourcePath = `${nativeRoot}/Sources/InthCore/Transports.swift`;
const core = 'extension Inth { public static let version = "3.0.0-alpha.1" }\n';
const manifest = `// swift-tools-version:5.9
import PackageDescription
let package = Package(
    name: "InthCore",
    platforms: [.iOS("16.4")],
    products: [.library(name: "InthCore", targets: ["InthCore"])],
    targets: [
        .target(name: "InthCore"),
        .testTarget(name: "InthCoreTests", dependencies: ["InthCore"]),
    ]
)
`;
const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

const fixture = (packageManifest = manifest) => {
	const directory = realpathSync(
		mkdtempSync(join(tmpdir(), 'inth-swift-export-'))
	);
	directories.push(directory);
	const cwd = join(directory, 'source');
	mkdirSync(cwd);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
	git('init', '--quiet');
	const write = (path: string, content: string | Buffer) => {
		const target = join(cwd, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, content);
	};
	const commit = () => {
		git('add', '--all');
		git(
			'-c',
			'user.name=Swift exporter test',
			'-c',
			'user.email=swift-export@example.invalid',
			'-c',
			'commit.gpgsign=false',
			'commit',
			'--quiet',
			'-m',
			'test: native source fixture'
		);
		return git('rev-parse', 'HEAD');
	};
	write('LICENSE', 'Apache License\nVersion 2.0, January 2004\n');
	write('NOTICE', 'inth attribution\n');
	write(`${nativeRoot}/Package.swift`, packageManifest);
	write(sourcePath, core);
	write(
		`${nativeRoot}/Tests/InthCoreTests/fixture-tests.swift`,
		'// shared fixtures\n'
	);
	write(
		`${nativeRoot}/Resources/Privacy.xcprivacy`,
		'<plist>native privacy</plist>\n'
	);
	write('packages/native-protocol/index.json', '{"fixtures":[]}\n');
	write('packages/native-protocol/nested/fixture.json', '{"native":true}\n');
	write(
		'examples/native/consent-demo/fixtures/iab-init.json',
		'{"iab":true}\n'
	);
	return {
		commit,
		cwd,
		git,
		output: join(directory, 'export'),
		read: (path: string) => readFileSync(join(cwd, path)),
		write,
	};
};

const tree = (
	directory: string
): Record<string, { content: string; mode: number }> =>
	Object.fromEntries(
		readdirSync(directory, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => {
				const path = join(entry.parentPath, entry.name);
				return [
					path.slice(directory.length + 1),
					{
						content: readFileSync(path).toString('base64'),
						mode: statSync(path).mode % 0o1000,
					},
				];
			})
	);

describe('Swift source distribution', () => {
	it('preserves the committed root manifest for monorepo release validation', () => {
		const repo = fixture();
		const rootManifest = manifest
			.replace('name: "InthCore",\n', 'name: "inth",\n')
			.replace(
				'.target(name: "InthCore")',
				'.target(name: "InthCore", path: "packages/swift/Sources/InthCore")'
			);
		repo.write('Package.swift', rootManifest);
		const sourceCommit = repo.commit();
		repo.write('Package.swift', '// Uncommitted manifest must not ship\n');
		exportSwiftPackage({
			cwd: repo.cwd,
			manifest: 'root',
			output: repo.output,
			ref: sourceCommit,
		});
		expect(readFileSync(join(repo.output, 'Package.swift'), 'utf8')).toBe(
			rootManifest
		);
	});

	it('requires a committed root manifest for monorepo releases', () => {
		const repo = fixture();
		const ref = repo.commit();
		expect(() =>
			exportSwiftPackage({
				cwd: repo.cwd,
				manifest: 'root',
				output: repo.output,
				ref,
			})
		).toThrow('missing Package.swift');
	});

	it('exports the resolved commit, preserves source bytes and keeps private files out', () => {
		const repo = fixture();
		for (const path of [
			`${nativeRoot}/Examples/private.swift`,
			`${nativeRoot}/.build/debug/binary`,
			`${nativeRoot}/.swiftpm/configuration.json`,
			`${nativeRoot}/InthCore.podspec`,
			`${nativeRoot}/CHANGELOG.md`,
			`${nativeRoot}/Sources/InthCore/.build/stale.swift`,
			'packages/private/secret.txt',
			'packages/android/private.kt',
		]) {
			repo.write(path, 'must not ship');
		}
		repo.write(`${nativeRoot}/Resources/binary.dat`, Buffer.from([0, 255, 10]));
		repo.write(
			`${nativeRoot}/AGENTS.md`,
			'# inth for Swift: notes for coding agents\n'
		);
		repo.write('AGENTS.md', '# Monorepo contributor guide\n');
		const sourceCommit = repo.commit();
		repo.write(sourcePath, 'uncommitted source must not ship');
		repo.write(`${nativeRoot}/Sources/InthCore/untracked.swift`, 'untracked');
		const result = exportSwiftPackage({ ...repo, ref: 'HEAD' });
		expect(result).toEqual({
			output: repo.output,
			sourceCommit,
			version: '3.0.0-alpha.1',
		});
		expect(readFileSync(join(repo.output, sourcePath), 'utf8')).toBe(core);
		expect(
			readFileSync(join(repo.output, `${nativeRoot}/Resources/binary.dat`))
		).toEqual(Buffer.from([0, 255, 10]));
		expect(readFileSync(join(repo.output, 'LICENSE'))).toEqual(
			repo.read('LICENSE')
		);
		expect(readFileSync(join(repo.output, 'NOTICE'))).toEqual(
			repo.read('NOTICE')
		);
		const exported = Object.keys(tree(repo.output));
		expect(exported).not.toContain(
			`${nativeRoot}/Sources/InthCore/untracked.swift`
		);
		expect(
			exported.some(
				(path) => path.includes('private') || path.includes('.build')
			)
		).toBe(false);
		expect(exported).not.toContain(`${nativeRoot}/InthCore.podspec`);
		expect(exported).not.toContain(`${nativeRoot}/CHANGELOG.md`);
		// The consumer notes ship; the monorepo's contributor AGENTS.md does not.
		expect(readFileSync(join(repo.output, `${nativeRoot}/AGENTS.md`))).toEqual(
			repo.read(`${nativeRoot}/AGENTS.md`)
		);
		expect(exported).not.toContain('AGENTS.md');
		expect(
			readFileSync(join(repo.output, `${nativeRoot}/Package.swift`))
		).toEqual(repo.read(`${nativeRoot}/Package.swift`));
	});

	it('retains the canonical products, target dependencies and fixture-relative layout', () => {
		const canonical = readFileSync(
			new URL('../packages/swift/Package.swift', import.meta.url),
			'utf8'
		);
		const repo = fixture(canonical);
		repo.commit();
		exportSwiftPackage({ ...repo, ref: 'HEAD' });
		const root = readFileSync(join(repo.output, 'Package.swift'), 'utf8');
		const products = (source: string) =>
			source.slice(source.indexOf('products:'), source.indexOf('targets: [\n'));
		expect(products(root)).toBe(products(canonical));
		for (const name of ['InthApple', 'InthConsentUI', 'InthCoreBench']) {
			expect(root).toContain(`path: "${nativeRoot}/Sources/${name}"`);
		}
		for (const name of [
			'InthCoreTests',
			'InthAppleTests',
			'InthConsentUITests',
		]) {
			expect(root).toContain(`path: "${nativeRoot}/Tests/${name}"`);
		}
		expect(root).toContain(
			'dependencies: ["InthConsentUI", "InthCore", "InthApple"]'
		);
		const testDirectory = join(
			repo.output,
			`${nativeRoot}/Tests/InthCoreTests`
		);
		expect(
			readFileSync(
				resolve(testDirectory, '../../../native-protocol/index.json'),
				'utf8'
			)
		).toBe('{"fixtures":[]}\n');
		expect(
			readFileSync(
				resolve(
					testDirectory,
					'../../../../examples/native/consent-demo/fixtures/iab-init.json'
				),
				'utf8'
			)
		).toBe('{"iab":true}\n');
	});

	it('resolves an earlier commit when invoked from a repository subdirectory', () => {
		const repo = fixture();
		const sourceCommit = repo.commit();
		repo.write(sourcePath, core.replace('3.0.0-alpha.1', '3.0.0-alpha.2'));
		repo.commit();
		const result = exportSwiftPackage({
			cwd: join(repo.cwd, nativeRoot),
			output: repo.output,
			ref: sourceCommit,
		});
		expect(result.version).toBe('3.0.0-alpha.1');
		expect(result.sourceCommit).toBe(sourceCommit);
		expect(readFileSync(join(repo.output, sourcePath), 'utf8')).toBe(core);
	});

	it('prefixes explicit target paths and preserves target-relative resource declarations', () => {
		const withResources = manifest.replace(
			'.target(name: "InthCore")',
			`.target(
            name: "InthCore",
            path: ".",
            sources: ["Sources/InthCore"],
            resources: [.copy("Resources/Privacy.xcprivacy")]
        )`
		);
		const repo = fixture(withResources);
		repo.commit();
		exportSwiftPackage({ ...repo, ref: 'HEAD' });
		const root = readFileSync(join(repo.output, 'Package.swift'), 'utf8');
		expect(root).toContain(`path: "${nativeRoot}"`);
		expect(root).toContain('sources: ["Sources/InthCore"]');
		expect(root).toContain('resources: [.copy("Resources/Privacy.xcprivacy")]');
		expect(
			readFileSync(
				join(repo.output, nativeRoot, 'Resources/Privacy.xcprivacy'),
				'utf8'
			)
		).toContain('native privacy');
	});

	it('inserts path before resources without changing comments or string contents', () => {
		const repo = fixture(
			manifest.replace(
				'.target(name: "InthCore")',
				`.target(name: "InthCore", /* nested /* target */ comment */ resources: [.copy("Privacy.xcprivacy")])`
			)
		);
		repo.commit();
		exportSwiftPackage({ ...repo, ref: 'HEAD' });
		expect(readFileSync(join(repo.output, 'Package.swift'), 'utf8')).toContain(
			`.target(name: "InthCore", path: "${nativeRoot}/Sources/InthCore", /* nested /* target */ comment */ resources: [.copy("Privacy.xcprivacy")])`
		);
	});

	it('writes deterministic provenance and tracked file modes for every exported file', () => {
		const repo = fixture();
		repo.write(`${nativeRoot}/Resources/executable`, 'executable resource\n');
		chmodSync(join(repo.cwd, nativeRoot, 'Resources/executable'), 0o755);
		const sourceCommit = repo.commit();
		exportSwiftPackage({ ...repo, ref: 'HEAD' });
		const second = `${repo.output}-second`;
		exportSwiftPackage({ ...repo, output: second, ref: sourceCommit });
		expect(tree(second)).toEqual(tree(repo.output));
		const provenance = JSON.parse(
			readFileSync(join(repo.output, 'swift-package-source.json'), 'utf8')
		);
		expect(provenance).toMatchObject({
			schemaVersion: 1,
			sourceCommit,
			version: '3.0.0-alpha.1',
		});
		expect(JSON.stringify(provenance)).not.toContain('example.invalid');
		for (const file of provenance.files) {
			const path = join(repo.output, file.path);
			expect(file.sha256).toBe(
				createHash('sha256').update(readFileSync(path)).digest('hex')
			);
			expect(statSync(path).mode % 0o1000).toBe(
				file.mode === '100755' ? 0o755 : 0o644
			);
		}
		expect(
			provenance.files.map((file: { path: string }) => file.path).sort()
		).toEqual(
			Object.keys(tree(repo.output))
				.filter((path) => path !== 'swift-package-source.json')
				.sort()
		);
	});

	it('rejects existing destinations and direct or symlinked paths inside the source repository', () => {
		const repo = fixture();
		repo.commit();
		for (const output of [repo.cwd, join(repo.cwd, 'new/export')]) {
			expect(() =>
				exportSwiftPackage({ ...repo, output, ref: 'HEAD' })
			).toThrow('outside the source repository');
		}
		const alias = `${repo.output}-alias`;
		symlinkSync(repo.cwd, alias);
		expect(() =>
			exportSwiftPackage({
				...repo,
				output: join(alias, 'new/export'),
				ref: 'HEAD',
			})
		).toThrow('outside the source repository');
		mkdirSync(repo.output);
		writeFileSync(join(repo.output, 'keep'), 'existing');
		expect(() => exportSwiftPackage({ ...repo, ref: 'HEAD' })).toThrow(
			'already exists'
		);
		expect(readFileSync(join(repo.output, 'keep'), 'utf8')).toBe('existing');
	});

	it.each([
		{
			manifest: manifest.replace(
				'.target(name: "InthCore")',
				'.target(name: "InthCore", path: "../private")'
			),
			reason: 'inside packages/swift',
		},
		{
			manifest: manifest.replace(
				'targets: [\n',
				'targets: customTargets + [\n'
			),
			reason: 'Unsupported Swift manifest',
		},
		{
			manifest: manifest.replace(
				'.target(name: "InthCore")',
				'.binaryTarget(name: "InthCore", path: "binary")'
			),
			reason: 'Unsupported Swift manifest',
		},
		{
			manifest: manifest.replace(
				'.target(name: "InthCore")',
				'.target(name: coreName)'
			),
			reason: 'Unsupported Swift manifest',
		},
	])(
		'refuses unsupported or escaping manifest declarations, $reason',
		({ manifest: source, reason }) => {
			const repo = fixture(source);
			repo.commit();
			expect(() => exportSwiftPackage({ ...repo, ref: 'HEAD' })).toThrow(
				reason
			);
			expect(existsSync(repo.output)).toBe(false);
		}
	);

	it('refuses symlinks rather than exporting files from outside the source commit', () => {
		const repo = fixture();
		symlinkSync(
			'/private/source',
			join(repo.cwd, nativeRoot, 'Sources/InthCore/link.swift')
		);
		repo.commit();
		expect(() => exportSwiftPackage({ ...repo, ref: 'HEAD' })).toThrow(
			'regular files'
		);
		expect(existsSync(repo.output)).toBe(false);
	});

	it.each(['LICENSE', 'NOTICE', sourcePath])(
		'refuses a release missing %s',
		(path) => {
			const repo = fixture();
			rmSync(join(repo.cwd, path));
			repo.commit();
			expect(() => exportSwiftPackage({ ...repo, ref: 'HEAD' })).toThrow(
				`missing ${path}`
			);
			expect(existsSync(repo.output)).toBe(false);
		}
	);

	it('refuses invalid native versions and invalid source refs before creating output', () => {
		const repo = fixture();
		repo.write(sourcePath, core.replace('3.0.0-alpha.1', 'not-a-version'));
		repo.commit();
		expect(() => exportSwiftPackage({ ...repo, ref: 'HEAD' })).toThrow(
			'valid Inth.version'
		);
		expect(() => exportSwiftPackage({ ...repo, ref: '--not-a-ref' })).toThrow();
		expect(existsSync(repo.output)).toBe(false);
	});
});
