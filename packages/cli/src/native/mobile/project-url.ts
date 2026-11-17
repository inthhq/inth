// The project URL rule the mobile SDKs share. They work only with Inth hosted
// projects, so a backend URL must be an Inth project host.
//
// packages/native-protocol/project-url/cases.json is the shared fixture. The
// Expo plugin (packages/react-native/src/expo-plugin/project-url.ts), Swift and
// Kotlin apply the same steps in the same order, and test/mobile/project-url.test.ts
// runs this copy on that fixture.

import { CliError } from "../../cli-error.ts";

/** A project host is one or more labels in front of one of these. */
export const INTH_PROJECT_HOST_SUFFIXES = ["inth.app"];

/** Why a URL was refused, as the fixture's `reasons` codes name it. */
export type ProjectUrlReason =
  | "empty"
  | "malformed"
  | "scheme"
  | "credentials"
  | "host"
  | "port"
  | "path"
  | "query";

const EXAMPLE = "https://your-project.inth.app";

const PROJECT_HOST = new RegExp(
  `^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+(${INTH_PROJECT_HOST_SUFFIXES.map(
    (suffix) => suffix.replaceAll(".", "\\.")
  ).join("|")})$`,
  "u"
);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** A host name or a bracketed IPv6 literal, the shapes the relaxed rule takes. */
const PLAUSIBLE_HOST = /^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+)$/u;

const detail = (reason: ProjectUrlReason, relaxed: boolean): string => {
  if (reason === "credentials") {
    return "it must not carry a username or password";
  }
  if (reason === "empty") {
    return "the value is empty";
  }
  if (reason === "host") {
    return `the host must be a project host under ${INTH_PROJECT_HOST_SUFFIXES.join(" or ")}`;
  }
  if (reason === "malformed") {
    return "it does not parse as a URL";
  }
  if (reason === "path") {
    return "it must not have a path";
  }
  if (reason === "port") {
    return "it must not name a port";
  }
  if (reason === "query") {
    return "it must not have a query or a fragment";
  }
  return relaxed
    ? "the scheme must be https, or http on localhost, 127.0.0.1 or [::1]"
    : "the scheme must be https";
};

/** A backend URL that is not an Inth project URL. */
export class ProjectUrlError extends CliError {
  /** The fixture's reason code. */
  readonly reason: ProjectUrlReason;
  constructor(
    reason: ProjectUrlReason,
    input: string,
    option: string,
    relaxed: boolean
  ) {
    super(
      "usage_error",
      `${option} must be the project URL from your Inth dashboard, such as ${EXAMPLE}. Got "${input}": ${detail(reason, relaxed)}.`
    );
    this.name = "ProjectUrlError";
    this.reason = reason;
  }
}

/** The parts of a URL the rule looks at, as written apart from case. */
interface ProjectUrlParts {
  scheme: string;
  host: string;
  /** Empty when the URL names no port. */
  port: string;
  /** Without trailing slashes. */
  path: string;
  hasCredentials: boolean;
  hasQuery: boolean;
}

interface HostPort {
  host: string;
  port: string;
  valid: boolean;
}

/** Host and port of `host`, `host:port` or `[v6]:port`. */
const splitPort = (hostPort: string): HostPort => {
  let host = hostPort;
  let after = "";
  if (hostPort.startsWith("[")) {
    const close = hostPort.indexOf("]");
    if (close === -1) {
      return { host: "", port: "", valid: false };
    }
    host = hostPort.slice(0, close + 1);
    after = hostPort.slice(close + 1);
  } else {
    const colon = hostPort.indexOf(":");
    if (colon !== -1) {
      host = hostPort.slice(0, colon);
      after = hostPort.slice(colon);
    }
  }
  if (after === "") {
    return { host, port: "", valid: true };
  }
  const port = after.slice(1);
  const valid =
    after.startsWith(":") && /^[0-9]+$/u.test(port) && Number(port) <= 65_535;
  return { host, port, valid };
};

/** Split `scheme://authority/path?query`; the host is empty when none can be read. */
const splitUrl = (url: string): ProjectUrlParts => {
  const separator = url.indexOf("://");
  const rest = url.slice(separator + 3);
  const authorityEnd = rest.search(/[#/?]/u);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  const tail = authorityEnd === -1 ? "" : rest.slice(authorityEnd);
  const hostPort = splitPort(authority.slice(authority.lastIndexOf("@") + 1));
  const pathEnd = tail.search(/[#?]/u);
  return {
    hasCredentials: authority.includes("@"),
    hasQuery: pathEnd !== -1,
    host: hostPort.valid ? hostPort.host.toLowerCase() : "",
    path: (pathEnd === -1 ? tail : tail.slice(0, pathEnd)).replace(/\/+$/u, ""),
    port: hostPort.port,
    scheme: url.slice(0, separator).toLowerCase(),
  };
};

/** What only the strict rule refuses: the host, a port and a path, in that order. */
const strictProblem = (parts: ProjectUrlParts): ProjectUrlReason | "" => {
  if (!PROJECT_HOST.test(parts.host)) {
    return "host";
  }
  if (parts.port !== "") {
    return "port";
  }
  return parts.path === "" ? "" : "path";
};

/** The first reason to refuse a trimmed, non-empty value, or "". */
const inspectUrl = (
  value: string,
  parts: ProjectUrlParts,
  relaxed: boolean
): ProjectUrlReason | "" => {
  if (/\s/u.test(value)) {
    return "malformed";
  }
  if (parts.scheme !== "https" && !(relaxed && parts.scheme === "http")) {
    return "scheme";
  }
  if (parts.host === "") {
    return "malformed";
  }
  if (relaxed && !PLAUSIBLE_HOST.test(parts.host)) {
    return "malformed";
  }
  if (parts.scheme === "http" && !LOOPBACK_HOSTS.has(parts.host)) {
    return "scheme";
  }
  if (parts.hasCredentials) {
    return "credentials";
  }
  const strict = relaxed ? "" : strictProblem(parts);
  if (strict !== "") {
    return strict;
  }
  return parts.hasQuery ? "query" : "";
};

const parses = (url: string): boolean => {
  try {
    return new URL(url).protocol !== "";
  } catch {
    return false;
  }
};

/**
 * Check a project URL and return its normal form.
 *
 * The strict rule takes `https://<project>.<suffix>` with no port, path,
 * query or credentials, and returns `https://<lowercased host>`. A value
 * without a scheme gets `https://`. The relaxed rule, for a `dryRun` build,
 * takes any https URL, or http on a loopback host, with a port and a path.
 * @param input The value as the developer wrote it.
 * @param option The flag name the message starts with, such as --backend-url.
 * @param relaxed Apply the relaxed rule.
 * @returns The normal form, without a trailing slash.
 * @throws {ProjectUrlError} usage_error, with the fixture's reason code.
 */
export const normalizeProjectUrl = (
  input: string,
  option: string,
  relaxed = false
): string => {
  const value = input.trim();
  if (value === "") {
    throw new ProjectUrlError("empty", input, option, relaxed);
  }
  const parts = splitUrl(value.includes("://") ? value : `https://${value}`);
  const reason = inspectUrl(value, parts, relaxed);
  if (reason !== "") {
    throw new ProjectUrlError(reason, input, option, relaxed);
  }
  const port = parts.port === "" ? "" : `:${parts.port}`;
  const normalized = `${parts.scheme}://${parts.host}${port}${parts.path}`;
  // The relaxed rule takes hosts and paths the checks above do not vet.
  if (!parses(normalized)) {
    throw new ProjectUrlError("malformed", input, option, relaxed);
  }
  return normalized;
};
