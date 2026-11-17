import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	realpathSync,
	writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, posix, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { valid } from 'semver';

const nativeRoot = 'packages/swift';
const manifestPath = `${nativeRoot}/Package.swift`;
const versionPath = `${nativeRoot}/Sources/InthCore/Transports.swift`;
const metadataPath = 'swift-package-source.json';
const sourceRoots = [
	`${nativeRoot}/Sources/`,
	`${nativeRoot}/Tests/`,
	`${nativeRoot}/Resources/`,
	'packages/native-protocol/',
	'examples/native/consent-demo/fixtures/',
];
const sourceFiles = new Set([
	'LICENSE',
	'NOTICE',
	manifestPath,
	`${nativeRoot}/README.md`,
	// Where the guides are, for an agent in an app that depends on the package. The
	// monorepo's root AGENTS.md is contributor guidance and stays out.
	`${nativeRoot}/AGENTS.md`,
]);
const excludedSegments = new Set([
	'.build',
	'.swiftpm',
	'.DS_Store',
	'build',
	'dist',
	'node_modules',
]);

interface SwiftToken {
	text: string;
	start: number;
	end: number;
}

const manifestError = () =>
	new Error('Unsupported Swift manifest. Expected literal Package targets.');

const swiftTokens = (source: string): SwiftToken[] => {
	const tokens: SwiftToken[] = [];
	let offset = 0;
	while (offset < source.length) {
		const rest = source.slice(offset);
		if (rest.startsWith('/*')) {
			let depth = 1;
			offset += 2;
			while (depth > 0 && offset < source.length) {
				if (source.startsWith('/*', offset)) {
					depth += 1;
					offset += 2;
				} else if (source.startsWith('*/', offset)) {
					depth -= 1;
					offset += 2;
				} else {
					offset += 1;
				}
			}
			if (depth > 0) {
				throw manifestError();
			}
			continue;
		}
		const match = rest.match(
			/^(?:\s+|\/\/[^\n]*|"(?:\\[^\r\n]|[^"\\\r\n])*"|[A-Za-z_]\w*|[^\s])/u
		);
		const text = match?.[0];
		if (!text || text === '"' || text === '#') {
			throw manifestError();
		}
		if (!/^\s|^\/\//u.test(text)) {
			tokens.push({ end: offset + text.length, start: offset, text });
		}
		offset += text.length;
	}
	return tokens;
};

const splitArguments = (tokens: SwiftToken[]): SwiftToken[][] => {
	const groups: SwiftToken[][] = [];
	const brackets: string[] = [];
	let group: SwiftToken[] = [];
	for (const token of tokens) {
		if (token.text === ',' && brackets.length === 0) {
			if (group.length === 0) {
				throw manifestError();
			}
			groups.push(group);
			group = [];
			continue;
		}
		if (['(', '[', '{'].includes(token.text)) {
			brackets.push(token.text);
		} else if ([')', ']', '}'].includes(token.text)) {
			const expected = { ')': '(', ']': '[', '}': '{' }[token.text];
			if (brackets.pop() !== expected) {
				throw manifestError();
			}
		}
		group.push(token);
	}
	if (brackets.length > 0) {
		throw manifestError();
	}
	if (group.length > 0) {
		groups.push(group);
	}
	return groups;
};

const literalString = (tokens: SwiftToken[]): string => {
	const value =
		tokens.length === 1 &&
		tokens[0]?.text.match(/^"(?<value>[\w./-]+)"$/u)?.groups?.value;
	if (!value) {
		throw manifestError();
	}
	return value;
};

const namedArguments = (tokens: SwiftToken[]) => {
	const args = new Map<string, SwiftToken[]>();
	for (const group of splitArguments(tokens)) {
		const name = group[0]?.text;
		if (!name || group[1]?.text !== ':' || args.has(name)) {
			throw manifestError();
		}
		args.set(name, group.slice(2));
	}
	return args;
};

const prefixedTargetPath = (path: string) => {
	const normalized = posix.normalize(path);
	if (
		posix.isAbsolute(path) ||
		normalized === '..' ||
		normalized.startsWith('../')
	) {
		throw new Error('Swift target path must stay inside packages/swift.');
	}
	return `"${posix.join(nativeRoot, normalized)}"`;
};

const targetPathEdit = (declaration: SwiftToken[], names: Set<string>) => {
	const kind = declaration[1]?.text;
	if (
		declaration[0]?.text !== '.' ||
		!kind ||
		!['target', 'testTarget', 'executableTarget'].includes(kind) ||
		declaration[2]?.text !== '(' ||
		declaration.at(-1)?.text !== ')'
	) {
		throw manifestError();
	}
	const targetArgs = namedArguments(declaration.slice(3, -1));
	const nameTokens = targetArgs.get('name') ?? [];
	const name = literalString(nameTokens);
	if (!/^\w+$/u.test(name) || names.has(name)) {
		throw manifestError();
	}
	names.add(name);
	const pathTokens = targetArgs.get('path');
	const path = pathTokens
		? literalString(pathTokens)
		: `${kind === 'testTarget' ? 'Tests' : 'Sources'}/${name}`;
	const text = prefixedTargetPath(path);
	const pathToken = pathTokens?.[0];
	if (pathToken) {
		return { end: pathToken.end, start: pathToken.start, text };
	}
	const previous = (targetArgs.get('dependencies') ?? nameTokens).at(-1);
	if (!previous) {
		throw manifestError();
	}
	return {
		end: previous.end,
		start: previous.end,
		text: `, path: ${text}`,
	};
};

const rootManifest = (source: string): string => {
	const tokens = swiftTokens(source);
	const start = tokens.findIndex(
		(token, index) =>
			token.text === 'Package' && tokens[index + 1]?.text === '('
	);
	if (start < 0 || tokens.at(-1)?.text !== ')') {
		throw manifestError();
	}
	const args = namedArguments(tokens.slice(start + 2, -1));
	const targets = args.get('targets');
	if (targets?.[0]?.text !== '[' || targets.at(-1)?.text !== ']') {
		throw manifestError();
	}
	const names = new Set<string>();
	const edits = splitArguments(targets.slice(1, -1)).map((declaration) =>
		targetPathEdit(declaration, names)
	);
	if (names.size === 0) {
		throw manifestError();
	}
	let result = source;
	for (const edit of edits.sort((left, right) => right.start - left.start)) {
		result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
	}
	return result;
};

const outputPath = (cwd: string, output: string) => {
	let parent = resolve(cwd, output);
	const missing: string[] = [];
	while (!existsSync(parent)) {
		missing.unshift(posix.basename(parent));
		parent = dirname(parent);
	}
	return resolve(realpathSync(parent), ...missing);
};

/**
 * Export a commit's Swift package and fixtures without reading working-tree files.
 *
 * @param options - Source repository, commit reference and new external directory.
 * @returns The output path, resolved source commit and native release version.
 * @throws {Error} If output exists, resolves inside the repository, or inputs are unsupported.
 */
export const exportSwiftPackage = (options: {
	cwd: string;
	ref: string;
	output: string;
	manifest?: 'root' | 'native';
}): { output: string; sourceCommit: string; version: string } => {
	const cwd = realpathSync(
		execFileSync('git', ['rev-parse', '--show-toplevel'], {
			cwd: options.cwd,
			encoding: 'utf8',
			stdio: 'pipe',
		}).trim()
	);
	const git = (...args: string[]) =>
		execFileSync('git', args, {
			cwd,
			maxBuffer: 64 * 1024 * 1024,
			stdio: 'pipe',
		});
	const output = outputPath(options.cwd, options.output);
	const fromRepository = relative(cwd, output);
	if (
		fromRepository === '' ||
		(!fromRepository.startsWith(`..${posix.sep}`) &&
			!isAbsolute(fromRepository))
	) {
		throw new Error(
			'Swift export output must be outside the source repository.'
		);
	}
	if (existsSync(output)) {
		throw new Error('Swift export output already exists.');
	}
	const sourceCommit = git(
		'rev-parse',
		'--verify',
		'--end-of-options',
		`${options.ref}^{commit}`
	)
		.toString()
		.trim();
	const files = git(
		'ls-tree',
		'-rz',
		sourceCommit,
		'--',
		...(options.manifest === 'root' ? ['Package.swift'] : []),
		'LICENSE',
		'NOTICE',
		'packages/swift',
		'packages/native-protocol',
		'examples/native'
	)
		.toString()
		.split('\0')
		.filter(Boolean)
		.flatMap((entry) => {
			const { mode, type, object, path } =
				entry.match(
					/^(?<mode>\d+) (?<type>\w+) (?<object>[a-f\d]+)\t(?<path>.+)$/su
				)?.groups ?? {};
			if (!mode || !type || !object || !path) {
				throw new Error('Invalid git tree entry.');
			}
			if (
				(!(options.manifest === 'root' && path === 'Package.swift') &&
					!sourceFiles.has(path) &&
					!sourceRoots.some((root) => path.startsWith(root))) ||
				path.split('/').some((segment) => excludedSegments.has(segment))
			) {
				return [];
			}
			if (type !== 'blob' || !['100644', '100755'].includes(mode)) {
				throw new Error(`Swift export requires regular files: ${path}.`);
			}
			return [{ content: git('cat-file', 'blob', object), mode, path }];
		});
	const required = (path: string) => {
		const file = files.find((candidate) => candidate.path === path);
		if (!file) {
			throw new Error(`Swift export is missing ${path}.`);
		}
		return file.content.toString();
	};
	required('LICENSE');
	required('NOTICE');
	const versions = [
		...required(versionPath).matchAll(
			/public static let version = "(?<version>[^"]+)"/gu
		),
	];
	const version =
		versions.length === 1 ? versions[0]?.groups?.version : undefined;
	if (!version || valid(version) !== version) {
		throw new Error('Swift source must declare one valid Inth.version.');
	}
	if (options.manifest === 'root') {
		required('Package.swift');
	} else {
		files.push({
			content: Buffer.from(rootManifest(required(manifestPath))),
			mode: '100644',
			path: 'Package.swift',
		});
	}
	files.sort((left, right) =>
		left.path < right.path ? -1 : Number(left.path > right.path)
	);
	const metadata = {
		files: files.map(({ content, mode, path }) => ({
			mode,
			path,
			sha256: createHash('sha256').update(content).digest('hex'),
		})),
		schemaVersion: 1,
		sourceCommit,
		version,
	};
	mkdirSync(dirname(output), { recursive: true });
	mkdirSync(output);
	for (const { content, mode, path } of files) {
		const target = resolve(output, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, content);
		chmodSync(target, mode === '100755' ? 0o755 : 0o644);
	}
	const provenance = resolve(output, metadataPath);
	writeFileSync(provenance, `${JSON.stringify(metadata, null, 2)}\n`);
	chmodSync(provenance, 0o644);
	return { output, sourceCommit, version };
};

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const { values } = parseArgs({
		options: { out: { type: 'string' }, ref: { type: 'string' } },
	});
	if (!values.out || !values.ref) {
		throw new Error(
			'Use --ref <commit> --out <new directory outside the repository>.'
		);
	}
	console.info(
		JSON.stringify(
			exportSwiftPackage({
				cwd: process.cwd(),
				output: values.out,
				ref: values.ref,
			})
		)
	);
}
