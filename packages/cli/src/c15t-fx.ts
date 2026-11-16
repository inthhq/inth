// `inth c15t --inth`: Inth's hosted setup agent. inth runs fx
// (github.com/vercel-labs/fx), a native coding agent, in the app directory.
// fx's model requests go to Inth's wizard gateway with a short-lived session
// token, so the person needs no agent install or AI account. Everything fx
// stores lives in a private FX_HOME that inth writes, so the person's own fx
// settings, sign-ins and sessions never mix with these runs.
import { generateBoilerplateTemplate } from "../vendor/c15t/generate/index.ts";
import type { BoilerplateFramework } from "../vendor/c15t/generate/index.ts";
import { mergeEnvFile } from "../vendor/c15t/generate/source.ts";
import { CliError } from "./cli-error.ts";

export interface FxAsset {
  // Release file name, such as fx-macos-aarch64.tar.gz.
  name: string;
  // Hex SHA-256 of the archive, from the GitHub release.
  sha256: string;
}

export interface FxRelease {
  version: string;
  // Prefix for release files; the asset name is appended.
  baseUrl: string;
  // Keyed by `${process.platform}-${process.arch}`.
  assets: Record<string, FxAsset>;
}

// A new fx release can change settings or permission behavior, so the version
// is pinned and moved deliberately after the checks in scripts/c15t-checks.ts.
export const FX_VERSION = "0.0.17";
export const FX_RELEASE: FxRelease = {
  assets: {
    "darwin-arm64": {
      name: "fx-macos-aarch64.tar.gz",
      sha256:
        "5cacb5b3624a79db8fd4e31dcbc59d6a933d7e5ed4c397776d95df6b618296a9",
    },
    "darwin-x64": {
      name: "fx-macos-x86_64.tar.gz",
      sha256:
        "984eef6632d7bd27ff7b75befb52b9db32c25287905009db5822f6a669861fec",
    },
    "linux-arm64": {
      name: "fx-linux-aarch64.tar.gz",
      sha256:
        "b4633b8987ec43f1b9454e4629f3b5a4f1e086aae36b84ae4fefeacd6a53761f",
    },
    "linux-x64": {
      name: "fx-linux-x86_64.tar.gz",
      sha256:
        "78c155d59fa59e42fd56d93037fd75041868c9c67865e8c7f0ca6dcdfac23e75",
    },
  },
  baseUrl: `https://github.com/vercel-labs/fx/releases/download/v${FX_VERSION}/`,
  version: FX_VERSION,
};

/**
 * The fx build for this machine.
 * @returns The asset, or undefined where fx has no build, such as Windows.
 */
export const fxAsset = (
  release: FxRelease,
  platform: string,
  arch: string
): FxAsset | undefined => release.assets[`${platform}-${arch}`];

export const unsupportedPlatform = (): CliError =>
  new CliError(
    "usage_error",
    "Inth's setup agent runs on macOS and Linux. Run inth c15t prompt and paste the prompt into your coding agent."
  );

const BLOCK = 512;

const field = (bytes: Uint8Array, start: number, length: number): string => {
  let text = "";
  for (let index = start; index < start + length; index += 1) {
    const code = bytes[index] ?? 0;
    if (code === 0) {
      break;
    }
    text += String.fromCodePoint(code);
  }
  return text;
};

/**
 * Read one regular file out of an uncompressed tar archive.
 * @param archive The tar bytes.
 * @param name The file's base name, such as fx.
 * @returns The file's bytes, or undefined when the archive has no such file.
 */
export const tarFile = (
  archive: Uint8Array,
  name: string
): Uint8Array | undefined => {
  let offset = 0;
  while (offset + BLOCK <= archive.length) {
    const entry = field(archive, offset, 100);
    if (!entry) {
      return undefined;
    }
    const size = Number.parseInt(field(archive, offset + 124, 12).trim(), 8);
    if (!Number.isFinite(size) || size < 0) {
      return undefined;
    }
    const type = field(archive, offset + 156, 1);
    const prefix = field(archive, offset + 345, 155);
    const path = prefix ? `${prefix}/${entry}` : entry;
    const start = offset + BLOCK;
    if ((type === "" || type === "0") && path.replace(/^\.\//u, "") === name) {
      return start + size <= archive.length
        ? archive.slice(start, start + size)
        : undefined;
    }
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
  }
  return undefined;
};

export const hex = (bytes: Uint8Array): string => {
  let text = "";
  for (const byte of bytes) {
    text += byte.toString(16).padStart(2, "0");
  }
  return text;
};

// Policy fx applies to every tool call. The last matching rule wins, so each
// group allows by default and then denies. Allowed and denied actions need no
// model review; only commands with substitutions or chains go to the review.
type Rule = [pattern: string, action: string];
const SECRET_FILES = [".env*", "*/.env*", ".npmrc", "*/.npmrc", "*.pem"];
const READ_RULES: Rule[] = [
  ["*", "allow"],
  ...SECRET_FILES.map((pattern): Rule => [pattern, "deny"]),
];
const EDIT_RULES: Rule[] = [
  ["*", "allow"],
  // fx shows files inside the app as relative paths, so absolute, home and
  // parent paths are outside it.
  ["/*", "deny"],
  ["~*", "deny"],
  ["..*", "deny"],
  ["*/..*", "deny"],
  [".git/*", "deny"],
  ...SECRET_FILES.map((pattern): Rule => [pattern, "deny"]),
];
const SHELL_DENIED = [
  "*.env*",
  "*.npmrc*",
  "*INTH_WIZARD_TOKEN*",
  "printenv*",
  "sudo *",
  "su *",
  "git commit*",
  "git push*",
  "git reset*",
  "git stash*",
  "git clean*",
  "git checkout -- *",
  "npm publish*",
  "pnpm publish*",
  "yarn publish*",
  "yarn npm publish*",
  "bun publish*",
  "vercel*",
  "netlify*",
  "wrangler*",
  "fly *",
  "railway*",
  "inth *",
  "*| sh*",
  "*| bash*",
  "*|sh*",
  "*|bash*",
];
const SHELL_RULES: Rule[] = [
  ["*", "allow"],
  ...SHELL_DENIED.map((pattern): Rule => [pattern, "deny"]),
];
// Tools that would reach the person's own skills and MCP servers, start more
// agents on the same budget, or wait for answers no one can give.
const DENIED_TOOLS = [
  "skill",
  "install_skill",
  "mcp_select_tool",
  "capability_search",
  "subagent",
  "ask_user_question",
];

const rules = (entries: Rule[]): string =>
  `{${entries.map(([pattern, action]) => `${JSON.stringify(pattern)}:${JSON.stringify(action)}`).join(",")}}`;

export const FX_PROVIDER = "inth";
// fx reads the session token from this variable for each model request.
export const FX_TOKEN_VARIABLE = "INTH_WIZARD_TOKEN";

export interface WizardSession {
  token: string;
  gatewayUrl: string;
  model: string;
  smallModel: string;
}

/**
 * The gateway's Anthropic Messages prefix. fx appends /messages.
 * @throws {CliError} When the API returns a URL fx would not accept.
 */
export const fxBaseUrl = (gatewayUrl: string): string => {
  let url: URL;
  try {
    url = new URL(gatewayUrl);
  } catch {
    throw new CliError("invalid_response", "Invalid wizard gateway URL.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new CliError("invalid_response", "Invalid wizard gateway URL.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/u, "")}/v1`;
};

/**
 * fx's settings.json for one run: Inth's gateway as its only model
 * connection, and the tool policy.
 */
const modelMetadata = (id: string, output: number): string =>
  `${JSON.stringify(id)}:{"context_window":200000,"max_output_tokens":${output},"supports_tool_use":true}`;

export const fxSettings = (session: WizardSession): string => {
  const permission = [
    `"*":"allow"`,
    `"read":${rules(READ_RULES)}`,
    `"edit":${rules(EDIT_RULES)}`,
    `"bash":${rules(SHELL_RULES)}`,
    ...DENIED_TOOLS.map((tool) => `${JSON.stringify(tool)}:"deny"`),
  ];
  return `${[
    "{",
    `  "provider": ${JSON.stringify(FX_PROVIDER)},`,
    `  "providers": {"${FX_PROVIDER}": {"protocol":"anthropic-messages","base_url":${JSON.stringify(fxBaseUrl(session.gatewayUrl))},"auth":{"type":"bearer","env":"${FX_TOKEN_VARIABLE}"},"reviewer_model":${JSON.stringify(session.smallModel)},"timeouts":{"first_response_ms":300000},"model_metadata":{${modelMetadata(session.model, 32_000)},${modelMetadata(session.smallModel, 8000)}}}},`,
    `  "models": {"${FX_PROVIDER}": ${JSON.stringify(session.model)}},`,
    `  "permission_mode": "auto",`,
    `  "auto_upgrade": false,`,
    `  "prompt_history": {"enabled": false},`,
    `  "permission": {${permission.join(",")}}`,
    "}",
  ].join("\n")}\n`;
};

// Variables fx reads that would change its provider, model, permissions or
// home. The person's own values must not apply to this run.
const FX_OWN =
  /^(?:FX_|AI_GATEWAY_|VERCEL_OIDC_TOKEN$|TYPESAFE_API_KEY$|ANTHROPIC_|OPENAI_|XAI_)/u;

/** Variables for a child process, by name. */
export type ChildEnvironment = Record<string, string>;

/**
 * fx's environment: the person's shell environment for the commands fx runs,
 * without inth's or fx's own credentials and settings, plus this run's home
 * and session token.
 */
export const fxEnvironment = (
  inherited: Record<string, string | undefined>,
  home: string,
  token: string
) => {
  const env: ChildEnvironment = {};
  for (const [key, value] of Object.entries(inherited)) {
    if (
      value !== undefined &&
      !FX_OWN.test(key.toUpperCase()) &&
      key.toUpperCase() !== "INTH_TOKEN"
    ) {
      env[key] = value;
    }
  }
  env.FX_HOME = home;
  env.FX_AUTO_UPGRADE = "0";
  env.FX_DISABLE_KEYCHAIN = "1";
  env.FX_SOUND = "off";
  env.FX_HERDR = "0";
  env[FX_TOKEN_VARIABLE] = token;
  return env;
};

export const fxArguments = (
  session: WizardSession,
  prompt: string
): string[] => [
  "ask",
  "--json",
  "--no-color",
  "--permission-mode",
  "auto",
  "--provider",
  FX_PROVIDER,
  "--model",
  session.model,
  "--",
  prompt,
];

export interface BackendEnv {
  // Path relative to the app, always .env.
  file: string;
  name: string;
}

/**
 * The public variable the c15t quickstart for this framework reads the
 * backend URL from, as `inth c15t scaffold` writes it.
 * @returns The variable and its file, or undefined when the framework takes
 * the URL in source, such as plain HTML.
 */
export const backendEnv = (
  framework: BoilerplateFramework | undefined,
  backendURL: string
): { env: BackendEnv; line: string } | undefined => {
  if (!framework) {
    return undefined;
  }
  const line = generateBoilerplateTemplate({
    backendURL,
    framework,
    mode: "hosted",
    scripts: [],
  }).files[".env"];
  if (!line) {
    return undefined;
  }
  return {
    env: { file: ".env", name: line.slice(0, line.indexOf("=")) },
    line,
  };
};

export const mergeBackendEnv = (
  existing: string | null,
  line: string
): string => mergeEnvFile(existing, line);

/**
 * Instructions fx reads as the person's own (FX_HOME/AGENTS.md), on top of the
 * c15t setup prompt. They describe what inth already did and what this run
 * may not do, which its rules enforce.
 */
export const wizardInstructions = (
  backendURL: string,
  env: BackendEnv | undefined
): string =>
  [
    "# Inth c15t setup run",
    "",
    "You are running unattended inside `inth c15t`, Inth's setup agent, to add c15t consent management to the app in the current directory. No one can answer questions during the run: make reasonable choices, note them in the report, and keep going.",
    "",
    "Already done by inth:",
    "",
    "- The person signed in to Inth and chose the Inth project. Use the backend URL in the setup prompt exactly as given; do not create or change Inth projects.",
    env
      ? `- \`${env.name}\` is set to the backend URL in \`${env.file}\`. Read the backend URL from that variable in code. Do not read, print or edit \`.env\` files; they may hold secrets.`
      : `- No env file was written. Put the backend URL (${backendURL}) where the framework's quickstart puts it. Do not read, print or edit \`.env\` files; they may hold secrets.`,
    "",
    "Limits on this run, enforced by its rules:",
    "",
    "- Edit files inside this directory only. Never edit `.git`, `.env` files, `.npmrc` or keys.",
    "- Do not commit, push, stash, reset, publish or deploy. The person reviews the changes and commits them.",
    "- Install packages with the app's package manager, and run its typecheck, lint, test or build scripts to check your work. Do not start long-running servers.",
    "- There is no browser. Instead of checking consent in a browser, end the report with the exact checks the person should do in one.",
    "- Skills, MCP tools and subagents are unavailable.",
    "",
    "End with a short report that starts with `## c15t setup report`: what changed and why, files touched, commands run and their results, choices you made, and the browser checks for the person.",
    "",
  ].join("\n");

// The `fx ask --json` result. Other fields are ignored.
export interface FxResult {
  exit_code: number;
  output: string;
  final_output: string;
}

/**
 * Explain a failed run in one sentence.
 * @param output fx's assistant output, which carries a gateway refusal's text.
 */
export const fxFailure = (output: string): string => {
  if (output.includes("used its model budget")) {
    return "This run used its model budget. Your changes so far are in your working tree; run inth c15t --inth again to continue from them.";
  }
  if (
    output.includes("today’s wizard budget") ||
    output.includes("organization has used today")
  ) {
    return "Your Inth setup agent budget for today is used up. Try again tomorrow, or run inth c15t prompt and use your own coding agent.";
  }
  if (output.includes("at capacity today")) {
    return "Inth's setup agent is at capacity today. Try again tomorrow, or run inth c15t prompt and use your own coding agent.";
  }
  if (output.includes("session expired")) {
    return "The setup session expired. Run inth c15t --inth again to continue from the changes so far.";
  }
  return "Inth's setup agent stopped before finishing. Review any changes it made, then run inth c15t --inth again.";
};
