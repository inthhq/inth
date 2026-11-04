#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

interface Source {
	path: string;
	excludes?: string[];
	buildPhase?: string;
}
interface DemoProject {
	packages: Record<string, { path?: string; url?: string }>;
	targets: Record<
		string,
		{
			sources: (string | Source)[];
			info?: { path: string };
		}
	>;
}

const [, , destination] = process.argv;
if (!destination) {
	throw new Error('Usage: bun generate-project.ts /absolute/empty/output');
}
const output = resolve(destination);
const checkout = resolve(import.meta.dir, '../../../..');
const fromCheckout = relative(checkout, output);
if (
	fromCheckout !== '..' &&
	!fromCheckout.startsWith('../') &&
	!isAbsolute(fromCheckout)
) {
	throw new Error('Generate the demo project outside the checkout.');
}
if (existsSync(output) && readdirSync(output).length !== 0) {
	throw new Error('Use a new or empty output directory.');
}
const project = Bun.YAML.parse(
	readFileSync(resolve(import.meta.dir, 'project.yml'), 'utf8')
) as DemoProject;
for (const dependency of Object.values(project.packages)) {
	// Remote vendor packages carry a URL and a pinned version instead.
	if (dependency.path) {
		dependency.path = resolve(import.meta.dir, dependency.path);
	}
}
for (const target of Object.values(project.targets)) {
	target.sources = target.sources.map((source) => {
		const entry = typeof source === 'string' ? { path: source } : source;
		return { ...entry, path: resolve(import.meta.dir, entry.path) };
	});
	if (target.info) {
		target.info.path = resolve(output, target.info.path);
	}
}
mkdirSync(output, { recursive: true });
const spec = resolve(output, 'project.json');
writeFileSync(spec, `${JSON.stringify(project, null, 2)}\n`);
const result = spawnSync('xcodegen', ['generate', '--spec', spec], {
	stdio: 'inherit',
});
if (result.error) {
	throw result.error;
}
process.exit(result.status ?? 1);
