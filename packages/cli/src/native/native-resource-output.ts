import type { CliArguments } from "../arguments.ts";
import type { OAuthResponse } from "../auth-types.ts";
import { CliError } from "../cli-error.ts";
import type { DisplayOptions } from "../display.ts";
import { HttpError } from "../http-error.ts";
import type { ResourcePage, ResourceDetail } from "../resource-output-types.ts";
import { resourceIsList, resourceSummary } from "../resource-output.ts";

export const formatNativeResource = (
  options: CliArguments,
  response: OAuthResponse,
  display: DisplayOptions
): string => {
  try {
    if (response.status === 204) {
      return resourceSummary(options, { data: [], success: true }, display);
    }
    if (resourceIsList(options)) {
      // SAFETY: Scriptc checks the array, projected resource fields, and pagination metadata.
      const page = JSON.parse(response.body) as ResourcePage;
      if (!page.success) {
        throw new Error("Unsuccessful response");
      }
      return resourceSummary(options, page, display);
    }
    // SAFETY: Scriptc checks the response record and each field used for display.
    const result = JSON.parse(response.body) as ResourceDetail;
    if (!result.success) {
      throw new Error("Unsuccessful response");
    }
    return resourceSummary(
      options,
      { data: [result.data], success: true },
      display
    );
  } catch {
    const detail = new HttpError(response.status, "", response.requestId);
    throw new CliError(
      "invalid_response",
      `Cannot format the API response. Run the command with --json to inspect it.${detail.requestId ? ` Request ID: ${detail.requestId}` : ""}`,
      response.status,
      detail.requestId
    );
  }
};
