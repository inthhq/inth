import { API_ORIGIN } from "./auth-types.ts";
/* eslint-disable no-control-regex -- Reject controls before constructing a bearer destination URL. */
import { CliError } from "./cli-error.ts";

export const apiUrl = (path: string, organizationId?: string): string => {
  const message = "Use an API path under /v1/, for example /v1/projects.";
  if (
    (!path.startsWith("/v1/") && !path.startsWith(`${API_ORIGIN}/v1/`)) ||
    /[\\#\u0000-\u0020\u007F]/u.test(path)
  ) {
    throw new CliError("usage_error", message);
  }
  const url = new URL(path.startsWith("/") ? `${API_ORIGIN}${path}` : path);
  if (
    url.protocol !== "https:" ||
    url.host !== "api.inth.com" ||
    !url.pathname.startsWith("/v1/")
  ) {
    throw new CliError("usage_error", message);
  }
  if (organizationId && !url.searchParams.has("organizationId")) {
    url.searchParams.set("organizationId", organizationId);
  }
  return url.href;
};

export const apiKey = (
  flag?: string,
  environment?: string
): string | undefined => {
  const token = flag ?? (environment || undefined);
  if (token === undefined) {
    return undefined;
  }
  if (!/^inth_[^\s]+$/u.test(token)) {
    throw new CliError(
      "usage_error",
      "--token and INTH_TOKEN must contain an organization API key starting with inth_."
    );
  }
  return token;
};
