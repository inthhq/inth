import { RESOURCE_COMMANDS, RESOURCE_OPTIONS } from "./resource-commands.ts";

export const COMMANDS = [
  "login",
  "logout",
  "whoami",
  "auth status",
  "auth refresh",
  ...RESOURCE_COMMANDS.map(
    (entry) =>
      `${entry.command}${entry.action ? ` ${entry.action}` : ""}${entry.path.includes(":id") ? " <id>" : ""}${entry.required.map((name) => ` --${name} <${name}>`).join("")}`
  ),
  "api <path> [--method <method>] [--data <json>]",
  "switch [organization-id]",
  "link [organization-id]",
];
export const OPTIONS = [
  "--json",
  "--non-interactive",
  "--token <key>",
  "--organization <id>",
  ...RESOURCE_OPTIONS.map((name) => `--${name} <value>`),
  "--no-browser",
  "--help",
  "--version",
];
export const VERSION = "0.1.0";
export const HELP = `inth ${VERSION}

Usage: inth <command> [options]

Commands:
  login                     Sign in through your browser
  logout                    Revoke the CLI session and remove saved credentials
  auth refresh              Refresh the saved browser sign-in
  auth status               Show the local sign-in status without printing tokens
  whoami                    Fetch your identity and organizations from the API
${COMMANDS.slice(5, -2)
  .map((entry) => `  ${entry}`)
  .join("\n")}
  switch [organization-id]   Set your default organization
  link [organization-id]     Save an organization default for this directory

Options:
  --json                    Emit one JSON result; never prompt or open a browser
  --non-interactive         Disable prompts and browser login
  --token <inth_...>         Organization API key, overrides INTH_TOKEN
  --organization <id>        Organization for login or this API request
  --name <name>             Name for organization, project, or API key writes
  --slug <slug>             Organization slug for org create
  --limit <1-100>            List page size, defaults to 50
  --cursor <cursor>          Opaque cursor from pagination.nextCursor
  --region <id>              Project region from region list
  --description <text>       Project description
  --branding <value>         Consent branding: inth, c15t, or none
  --trusted-origins <json>   Consent origins as a JSON array of strings
  --email <email>            Invitation email address
  --role <role>              Member or invitation role: owner, admin, member
  --repository <id>          Repository for scan filters, starts, or requests
  --status <status>          Scan filter or Inbox status
  --request-id <id>          Idempotency key for a scan start
  --item-version <version>   Last-read Inbox version for an update
  --method <method>          Raw API method: GET, POST, PATCH, DELETE
  --data <json>              JSON object for writes, instead of body options
  --no-browser              Print the approval link without opening it
  -h, --help                Show help
  -v, --version             Show the version

Examples:
  inth login
  inth whoami
  inth org create --name "Acme" --slug acme
  inth project create --name Website --region <region-id>
  inth code-audit start --repository repo_123 --request-id deploy_123
  inth inbox update inbox_123 --status resolved --item-version 3
  inth project list --organization org_123
  INTH_TOKEN=inth_... inth api /v1/projects

Lists return one page with pagination.nextCursor. Fetch another page with --cursor.
Scan starts may return starting; poll code-audit request <preparation-id> --repository <id>.
Project deletion, member removal, invitations, key rotation, report unlocks, and
GitHub issue creation take effect immediately. Unlocks spend credits. API key
creation and rotation return a secret once; store it before closing the output.

Credentials stay in the OS credential store. Linked directories contain only
an organization ID. API keys supplied by flag or environment are never saved.`;
