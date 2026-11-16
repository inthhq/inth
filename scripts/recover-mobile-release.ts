import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { releaseLine } from './tegami';
import { createMobileRelease } from './tegami-mobile';

const lockPath = '.tegami/mobile/publish-lock.yaml';
const readLock = (cwd: string) => {
	const path = join(cwd, lockPath);
	if (!lstatSync(path).isFile()) {
		throw new Error('Recovery requires a regular native publish lock file.');
	}
	return readFileSync(path);
};

/** Finish the current lock from its original commit, using the current release tools. */
export const recoverMobileRelease = async function recoverMobileRelease({
	cwd = process.cwd(),
	branch,
	sourceCommit,
	dryRun = false,
	github = true,
}: {
	cwd?: string;
	branch: string;
	sourceCommit: string;
	dryRun?: boolean;
	github?: boolean;
}) {
	releaseLine(branch);
	if (!/^[a-f\d]{40}$/u.test(sourceCommit)) {
		throw new Error('Recovery requires a full 40-character source commit SHA.');
	}
	const git = (...args: string[]) =>
		execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim();
	if (git('status', '--porcelain', '--untracked-files=normal')) {
		throw new Error('Recovery requires a clean release checkout.');
	}
	const lock = readLock(cwd);
	// Fetch only from the checkout's origin, including a retained version-PR head
	// after a squash merge. Registry 404s never authorize replacing the lock.
	git('fetch', '--quiet', '--no-tags', 'origin', sourceCommit);
	if (git('cat-file', '-t', sourceCommit) !== 'commit') {
		throw new Error('Recovery source must be a commit, not a tag or tree.');
	}
	const root = mkdtempSync(join(tmpdir(), 'c15t-native-recovery-'));
	const source = join(root, 'source');
	let added = false;
	try {
		git(
			'-c',
			'core.hooksPath=/dev/null',
			'worktree',
			'add',
			'--quiet',
			'--detach',
			source,
			sourceCommit
		);
		added = true;
		if (!lock.equals(readLock(source))) {
			throw new Error(
				'Recovery source must contain the exact current native publish lock.'
			);
		}
		console.log(
			`Recover native release from ${sourceCommit}; dispatch checkout ${git('rev-parse', 'HEAD')}.`
		);
		return await createMobileRelease({
			branch,
			cwd: source,
			github,
			verifyNativeTests: true,
		}).publish({ dryRun });
	} finally {
		if (added) {
			git('worktree', 'remove', '--force', source);
		}
		rmSync(root, { force: true, recursive: true });
	}
};

if (import.meta.main) {
	await recoverMobileRelease({
		branch: process.env.GITHUB_REF_NAME ?? process.env.RELEASE_BRANCH ?? '',
		sourceCommit: process.argv[2] ?? '',
	});
}
