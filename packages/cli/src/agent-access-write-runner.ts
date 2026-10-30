import {
  resolveWriteRequest,
  writeApprovalMessage,
  writeOutcomeError,
  writeResultExitCode,
  writeRetryDiagnostic,
} from "./agent-access-write-request.ts";
import type { RequestDispatchObserver } from "./agent-types.ts";
import type { CliArguments } from "./arguments.ts";
import { saveBillingApproval } from "./billing-approval.ts";
import { CliError } from "./cli-error.ts";
import type { OrganizationUI } from "./organizations.ts";
import { approveResource } from "./resource-approval.ts";
import { resourceCommand } from "./resource-commands.ts";
import type { ResourceRequest } from "./resource-commands.ts";

export interface WriteApi {
  execute: (
    path: string,
    method: string,
    body?: string,
    organization?: string,
    accept?: string,
    once?: boolean,
    observeDispatch?: RequestDispatchObserver
  ) => Promise<string>;
  putImage: (
    path: string,
    bytes: Uint8Array,
    mediaType: string,
    organization?: string,
    observeDispatch?: RequestDispatchObserver
  ) => Promise<string>;
}
export const runV2Write = async (
  options: CliArguments,
  request: ResourceRequest,
  api: WriteApi,
  resolve: (organization?: string) => Promise<string | undefined>,
  ui: (message: string) => OrganizationUI
): Promise<string> => {
  const selected = await resolveWriteRequest(options, request, resolve);
  const message = writeApprovalMessage(
    options,
    selected.request,
    selected.organization
  );
  await approveResource(options, ui("Confirm reviewed action"), message);
  const diagnostic = writeRetryDiagnostic(options, selected.request);
  if (diagnostic) {
    console.error(diagnostic);
  }
  let output: string;
  let dispatched = false;
  const observeDispatch: RequestDispatchObserver = (started) => {
    dispatched = started;
  };
  try {
    if (resourceCommand(options)?.image) {
      const bytes = options.preparedImageBytes;
      const mediaType = options.preparedImageMediaType;
      if (!bytes || !mediaType) {
        throw new CliError(
          "usage_error",
          "Prepare a validated local image before sending."
        );
      }
      output = await api.putImage(
        selected.request.path,
        bytes,
        mediaType,
        selected.organization,
        observeDispatch
      );
    } else {
      output = await api.execute(
        selected.request.path,
        selected.request.method,
        selected.request.body,
        selected.organization,
        "application/json",
        true,
        observeDispatch
      );
    }
  } catch (error) {
    if (!dispatched) {
      throw error;
    }
    throw writeOutcomeError(error);
  }
  saveBillingApproval(options, selected.request, output);
  const code = writeResultExitCode(options, output);
  if (code) {
    process.exitCode = code;
  }
  return output;
};
