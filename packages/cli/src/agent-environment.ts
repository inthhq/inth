// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { join } from "node:path";

import { API_ORIGIN } from "./auth-types.ts";
import { CliError } from "./cli-error.ts";

export interface AgentEnvironment {
  apiOrigin: string;
  dashboardOrigin: string;
  account: string;
}

export const productionAgentEnvironment: AgentEnvironment = {
  account: "auth.md",
  apiOrigin: API_ORIGIN,
  dashboardOrigin: "https://inth.com",
};

const localOrigin = (value: string): string => {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.hostname.endsWith(".localhost")) ||
    !/^https:\/\/[^/?#@\\\s]+\/?$/u.test(value) ||
    url.pathname !== "/" ||
    url.search
  ) {
    throw new Error("Expected a local HTTPS origin.");
  }
  return `${url.protocol}//${url.host}`;
};

export const agentEnvironment = (
  apiOrigin?: string,
  dashboardOrigin?: string,
  authMode?: string
): AgentEnvironment => {
  if (!apiOrigin && !dashboardOrigin) {
    return productionAgentEnvironment;
  }
  try {
    if (!apiOrigin || !dashboardOrigin || authMode !== "agent") {
      throw new Error("Both local origins and agent mode are required.");
    }
    const api = localOrigin(apiOrigin);
    const dashboard = localOrigin(dashboardOrigin);
    return {
      account: `auth.md-local-${encodeURIComponent(api)}-${encodeURIComponent(dashboard)}`,
      apiOrigin: api,
      dashboardOrigin: dashboard,
    };
  } catch {
    throw new CliError(
      "usage_error",
      "Local testing requires --auth agent and both INTH_DEV_API_ORIGIN and INTH_DEV_DASHBOARD_ORIGIN set to local HTTPS origins."
    );
  }
};

export const agentStateDirectory = (
  base: string,
  environment: AgentEnvironment
): string =>
  environment.account === "auth.md" ? base : join(base, environment.account);
