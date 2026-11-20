#!/usr/bin/env bash
# Report a failed main-branch or nightly workflow run as a GitHub issue, so a red
# run that nobody is watching still reaches someone. One issue per title: while it
# is open, later failures add a comment to it instead of opening another.
#
#   GH_TOKEN=... INTH_FAILURE_TITLE="..." scripts/ci-report-failure.sh
#
# Reads GITHUB_REPOSITORY, GITHUB_SERVER_URL, GITHUB_RUN_ID, GITHUB_SHA,
# GITHUB_EVENT_NAME and GITHUB_WORKFLOW, which Actions sets. INTH_DRY_RUN=1 prints
# what it would post instead of posting.
set -euo pipefail

title="${INTH_FAILURE_TITLE:?INTH_FAILURE_TITLE names the issue}"
repo="${GITHUB_REPOSITORY:?}"
run_url="${GITHUB_SERVER_URL:-https://github.com}/${repo}/actions/runs/${GITHUB_RUN_ID:?}"
body="The ${GITHUB_WORKFLOW:-workflow} ${GITHUB_EVENT_NAME:-} run on \`${GITHUB_SHA:0:9}\` failed: ${run_url}

Close this issue once the workflow passes again. The next failure opens a new one."

# Search finds candidates; the exact-title match keeps a similar title from counting.
number="$(gh issue list --repo "${repo}" --state open --search "\"${title}\" in:title" \
	--json number,title --jq "map(select(.title == $(jq -Rn --arg t "${title}" '$t'))) | .[0].number // empty")"

if [[ "${INTH_DRY_RUN:-0}" == 1 ]]; then
	if [[ -n "${number}" ]]; then
		printf 'Would comment on #%s:\n%s\n' "${number}" "${body}"
	else
		printf 'Would open "%s":\n%s\n' "${title}" "${body}"
	fi
elif [[ -n "${number}" ]]; then
	gh issue comment "${number}" --repo "${repo}" --body "${body}"
else
	gh issue create --repo "${repo}" --title "${title}" --body "${body}"
fi
