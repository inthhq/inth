/**
 * GitHub REST requests the live vendor monitor makes to read and write its
 * issues.
 */
import { MONITOR_ISSUE_TITLE_PREFIX } from './monitor-issue.model';
import type { ExistingMonitorIssue } from './monitor-issue.model';

const GITHUB_REQUEST_TIMEOUT_MS = 30_000;

export interface GitHubIssue {
	number: number;
	title: string;
	body?: string;
	pull_request?: unknown;
}

/**
 * Performs an authenticated GitHub REST request.
 *
 * @param token - GitHub token with `issues: write` scope.
 * @param path - REST path beginning with `/`.
 * @throws {Error} with the status and response text on non-2xx responses,
 * or an abort error when the request exceeds 30s.
 */
export const githubRequest = async function githubRequest<T>(
	token: string,
	method: string,
	path: string,
	body?: unknown
): Promise<T> {
	const headers: Record<string, string> = {
		accept: 'application/vnd.github+json',
		authorization: `Bearer ${token}`,
		'x-github-api-version': '2022-11-28',
	};
	let serializedBody: string | undefined;
	if (body !== undefined) {
		headers['content-type'] = 'application/json';
		serializedBody = JSON.stringify(body);
	}

	const response = await fetch(`https://api.github.com${path}`, {
		body: serializedBody,
		headers,
		method,
		signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`GitHub API ${method} ${path} failed with ${response.status}: ${text}`
		);
	}

	return (await response.json()) as T;
};

/**
 * Lists open monitor issues (deduped by title prefix), including bodies so
 * failure signatures can be compared.
 *
 * @throws {Error} when a GitHub API page request fails.
 */
export const listOpenMonitorIssues = async function listOpenMonitorIssues(
	token: string,
	repository: string
): Promise<ExistingMonitorIssue[]> {
	const issues: ExistingMonitorIssue[] = [];

	for (let page = 1; page <= 10; page += 1) {
		// oxlint-disable-next-line no-await-in-loop -- Preserve sequential execution and callback compatibility.
		const batch = await githubRequest<GitHubIssue[]>(
			token,
			'GET',
			`/repos/${repository}/issues?state=open&per_page=100&page=${page}`
		);

		for (const issue of batch) {
			// The issues endpoint also returns pull requests; skip those.
			if (issue.pull_request) {
				continue;
			}

			if (issue.title.startsWith(MONITOR_ISSUE_TITLE_PREFIX)) {
				issues.push({
					body: issue.body,
					number: issue.number,
					title: issue.title,
				});
			}
		}

		if (batch.length < 100) {
			break;
		}
	}

	return issues;
};
