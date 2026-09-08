export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly apiCode: string | null;
  readonly requestId: string | null;
  constructor(status: number, code: string, requestId: string | null) {
    // Only known API and OAuth codes are displayed. Response bodies may contain secrets or terminal escapes.
    const known = new Set([
      "UNAUTHORIZED",
      "FORBIDDEN",
      "PLAN_REQUIRED",
      "RATE_LIMITED",
      "KEY_LIMIT_REACHED",
      "PAYLOAD_TOO_LARGE",
      "authorization_pending",
      "slow_down",
      "expired_token",
      "access_denied",
      "invalid_grant",
      "invalid_scope",
      "CONFLICT",
      "INVALID_PAYLOAD",
      "NOT_FOUND",
      "PLAN_LIMIT_REACHED",
      "SCAN_IN_PROGRESS",
      "UNLOCK_REQUIRED",
      "REPOSITORY_NOT_LINKED",
      "INSUFFICIENT_CREDITS",
      "INSUFFICIENT_SCOPE",
      "SERVICE_UNAVAILABLE",
    ]);
    const reason = known.has(code) ? ` (${code})` : "";
    let guidance = "";
    if (status === 400 && code === "invalid_scope") {
      guidance =
        " The OAuth server rejected the CLI's requested scopes. Check the deployed inth-cli client registration and its allowed scopes.";
    } else if (status === 403 && code === "INSUFFICIENT_SCOPE") {
      guidance =
        " This credential lacks a required capability. For browser sign-ins, run inth login again to approve the current scopes. Organization API keys cannot gain additional capabilities.";
    } else if (status === 409 && code === "CONFLICT") {
      guidance =
        " The request conflicts with the current resource state. Fetch it again before retrying.";
    } else if (status === 422 && code === "PLAN_LIMIT_REACHED") {
      guidance = " A plan or organization owner limit has been reached.";
    }
    const id =
      requestId?.replaceAll(/[^a-zA-Z0-9._:-]/gu, "").slice(0, 200) || null;
    super(
      `Request failed: HTTP ${status}${reason}.${guidance}${id ? ` Request ID: ${id}` : ""}`
    );
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.apiCode = known.has(code) ? code : null;
    this.requestId = id;
  }
}
