import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import fg from 'fast-glob';
import { parse } from 'yaml';

export interface Workspace {
	name: string;
	directory: string;
	dependencies: string[];
	scripts: Record<string, string>;
}

/**
 * The workspace globs for a root directory: its `workspaces` list, or the
 * `packages` of its `pnpm-workspace.yaml`.
 */
const workspacePatterns = function workspacePatterns(
	rootDirectory: string
): string[] {
	const root = JSON.parse(
		readFileSync(join(rootDirectory, 'package.json'), 'utf8')
	) as { workspaces?: string[] };
	if (root.workspaces) {
		return root.workspaces;
	}
	return (
		parse(readFileSync(join(rootDirectory, 'pnpm-workspace.yaml'), 'utf8')) as {
			packages: string[];
		}
	).packages.filter((pattern) => !pattern.startsWith('!'));
};

/** Reads every workspace package under a repository root. */
export const readWorkspaces = function readWorkspaces(
	rootDirectory = '.'
): Workspace[] {
	return fg
		.sync(
			workspacePatterns(rootDirectory).map(
				(pattern) => `${pattern}/package.json`
			),
			{
				cwd: rootDirectory,
				ignore: [
					'**/node_modules/**',
					'**/dist/**',
					'**/.next/**',
					'**/.nuxt/**',
					'**/.output/**',
					'**/storybook-static/**',
				],
			}
		)
		.map((path) => {
			const manifest = JSON.parse(
				readFileSync(join(rootDirectory, path), 'utf8')
			);
			return {
				dependencies: Object.keys({
					...manifest.dependencies,
					...manifest.devDependencies,
					...manifest.peerDependencies,
					...manifest.optionalDependencies,
				}),
				directory: dirname(path),
				name: manifest.name,
				scripts: manifest.scripts ?? {},
			};
		});
};
