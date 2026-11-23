/**
 * Reconciles GitHub monitor issues with a live vendor report.
 *
 * Reads the JSON report produced by `runner.ts`, then opens one deduped issue
 * per failing vendor, edits the issue body when a vendor's failure signature
 * changes, and closes issues for vendors that recovered. Sustained identical
 * failures produce no writes, so long incidents do not accumulate noise.
 * Focused runs only touch the vendors they probed.
 *
 * Usage (GitHub Actions):
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo \
 *     bun live-vendors/manage-issues.ts --report live-vendors-report.json
 */
import { githubRequest, listOpenMonitorIssues } from './github-issues.api';
import type { GitHubIssue } from './github-issues.api';
import type { LiveVendorReport } from './live-vendor-probe.model';
import { planMonitorIssueActions } from './monitor-issue.model';

/**
 * Reads the `--report` path from CLI arguments.
 *
 * @returns The report path, defaulting to `live-vendors-report.json`.
 * @throws {Error} when `--report` is passed without a value.
 */
const parseReportPath = function parseReportPath(argv: string[]): string {
	const index = argv.indexOf('--report');

	if (index !== -1) {
		const value = argv[index + 1];
		if (!value) {
			throw new Error('--report requires a file path');
		}
		return value;
	}

	return 'live-vendors-report.json';
};

/**
 * Reads a required environment variable.
 *
 * @throws {Error} naming the variable when it is unset or empty.
 */
const requireEnv = function requireEnv(name: string): string {
	const value = Bun.env[name];

	if (!value) {
		throw new Error(`Missing required environment variable ${name}`);
	}

	return value;
};

const main = async function main(): Promise<void> {
	const reportPath = parseReportPath(Bun.argv.slice(2));
	const token = requireEnv('GITHUB_TOKEN');
	const repository = requireEnv('GITHUB_REPOSITORY');

	const report = (await Bun.file(reportPath).json()) as LiveVendorReport;
	const existingIssues = await listOpenMonitorIssues(token, repository);
	const plan = planMonitorIssueActions(report, existingIssues);
	const failures: string[] = [];

	for (const action of plan.create) {
		try {
			// oxlint-disable-next-line no-await-in-loop -- Keep issue updates ordered and avoid concurrent API writes.
			const issue = await githubRequest<GitHubIssue>(
				token,
				'POST',
				`/repos/${repository}/issues`,
				{ body: action.body, title: action.title }
			);
			console.log(`Opened #${issue.number} for ${action.vendor}`);
		} catch (error) {
			failures.push(`create ${action.vendor}: ${String(error)}`);
		}
	}

	for (const action of plan.update) {
		try {
			// oxlint-disable-next-line no-await-in-loop -- Keep issue updates ordered and avoid concurrent API writes.
			await githubRequest(
				token,
				'PATCH',
				`/repos/${repository}/issues/${action.issueNumber}`,
				{ body: action.body }
			);
			console.log(
				`Updated #${action.issueNumber} — ${action.vendor} failure signature changed`
			);
		} catch (error) {
			failures.push(`update ${action.vendor}: ${String(error)}`);
		}
	}

	for (const action of plan.close) {
		try {
			// oxlint-disable-next-line no-await-in-loop -- Keep issue updates ordered and avoid concurrent API writes.
			await githubRequest(
				token,
				'POST',
				`/repos/${repository}/issues/${action.issueNumber}/comments`,
				{ body: action.body }
			);
			// oxlint-disable-next-line no-await-in-loop -- Keep issue updates ordered and avoid concurrent API writes.
			await githubRequest(
				token,
				'PATCH',
				`/repos/${repository}/issues/${action.issueNumber}`,
				{ state: 'closed', state_reason: 'completed' }
			);
			console.log(`Closed #${action.issueNumber} — ${action.vendor} recovered`);
		} catch (error) {
			failures.push(`close ${action.vendor}: ${String(error)}`);
		}
	}

	console.log(
		`Issue sync complete: ${plan.create.length} opened, ${plan.update.length} updated, ${plan.close.length} closed.`
	);

	if (failures.length > 0) {
		console.error(`Issue sync errors:\n- ${failures.join('\n- ')}`);
		process.exitCode = 1;
	}
};

await main();
