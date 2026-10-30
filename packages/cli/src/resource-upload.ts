import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { HttpError } from "./http-error.ts";
import type { MeResponse } from "./identity.ts";
import { terminalText } from "./organizations.ts";
import { optionValue } from "./resource-commands.ts";
import { putSupportFile, validateSupportGrant } from "./storage-upload.ts";
import type { SupportUploadGrant } from "./storage-upload.ts";
import { prepareUploadFile } from "./upload-file.ts";
import type { UploadFile } from "./upload-file.ts";
import { UploadReceipt } from "./upload-receipt.ts";
import type { UploadReceiptData } from "./upload-receipt.ts";

export interface UploadApi {
  uploadChat: (body: string, organization?: string) => Promise<string>;
  execute: (
    path: string,
    method: string,
    body?: string,
    organization?: string
  ) => Promise<string>;
}
interface AttachmentMetadata {
  id: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  status?: string;
  downloadUrl: string;
}
interface UploadResponse {
  success: boolean;
  data: {
    organizationId?: string;
    attachment: AttachmentMetadata;
    upload?: SupportUploadGrant;
  };
}

const invalid = (): CliError =>
  new CliError(
    "invalid_response",
    "Inth returned invalid attachment metadata. Use the recovery command before trying another upload."
  );

const metadata = (
  source: string,
  file: UploadFile,
  group: string,
  organization: string,
  expectedId = ""
): UploadResponse => {
  try {
    // SAFETY: Scriptc checks this response record; explicit checks also protect Node.
    const result = JSON.parse(source) as UploadResponse;
    const item = result.data.attachment;
    const validId =
      group === "chat"
        ? /^aga_[A-Za-z0-9_-]{1,60}$/u.test(item.id)
        : /^sat_[1-9a-km-z]+$/u.test(item.id);
    if (
      !result.success ||
      !validId ||
      (expectedId && item.id !== expectedId) ||
      item.fileName !== file.fileName ||
      item.mediaType !== file.mediaType ||
      item.sizeBytes !== file.sizeBytes ||
      (result.data.organizationId !== undefined &&
        result.data.organizationId !== organization) ||
      item.downloadUrl !==
        `/v1/${group === "chat" ? "agent-chat-attachments" : "support/attachments"}/${item.id}/content`
    ) {
      throw invalid();
    }
    return result;
  } catch {
    throw invalid();
  }
};

interface UploadResultData {
  attachment: AttachmentMetadata;
  clientAttachmentId: string;
  organizationId: string;
  receiptPath?: string;
}
const updateReceipt = (
  receipt: UploadReceipt | undefined,
  state: UploadReceiptData
): void => {
  if (receipt) {
    receipt.update(state);
  }
};
const safeAttachment = (item: AttachmentMetadata): AttachmentMetadata => ({
  downloadUrl: item.downloadUrl,
  fileName: item.fileName,
  id: item.id,
  mediaType: item.mediaType,
  sizeBytes: item.sizeBytes,
  status: item.status ?? "ready",
});

// eslint-disable-next-line anti-slop/no-unknown-parameters -- Inspect only known error classes at the caught-error boundary.
const status = (error: unknown): number | null => {
  if (error instanceof CliError) {
    return error.httpStatus;
  }
  if (error instanceof HttpError) {
    return error.status;
  }
  return null;
};

// eslint-disable-next-line anti-slop/no-unknown-parameters -- Read safe IDs from known error classes at the transport failure boundary.
const errorRequestId = (error: unknown): string | null => {
  if (error instanceof HttpError) {
    return error.requestId;
  }
  if (error instanceof CliError) {
    return error.requestId;
  }
  return null;
};
const uploadChat = async (
  file: UploadFile,
  api: UploadApi,
  organization: string,
  signal: AbortSignal
): Promise<string> => {
  const bytes = await file.readBytes(signal);
  const body = JSON.stringify({
    data: Buffer.from(bytes).toString("base64"),
    fileName: file.fileName,
    mediaType: file.mediaType,
  });
  signal.throwIfAborted();
  try {
    const result = metadata(
      await api.uploadChat(body, organization),
      file,
      "chat",
      organization
    );
    return JSON.stringify({
      data: {
        attachment: safeAttachment(result.data.attachment),
        organizationId: organization,
      },
      success: true,
    });
  } catch (error) {
    if (
      error instanceof CliError &&
      error.httpStatus === null &&
      error.code !== "invalid_response"
    ) {
      throw error;
    }
    const code = status(error);
    if (
      code !== null &&
      code >= 400 &&
      code < 500 &&
      ![408, 429].includes(code)
    ) {
      throw error;
    }
    const recovery = `Run inth chat attachment-list --organization ${terminalText(organization)} --json before another upload. Draft names and sizes alone cannot identify a concurrent upload.`;
    console.error(recovery);
    signal.throwIfAborted();
    throw new CliError(
      "upload_outcome_unknown",
      `The chat upload outcome is unknown. ${recovery}`,
      code,
      errorRequestId(error)
    );
  }
};

const selectedOrganization = async (
  api: UploadApi,
  resolve: () => Promise<string | undefined>
): Promise<string> => {
  const local = await resolve();
  if (local) {
    return local;
  }
  try {
    // SAFETY: Scriptc checks the identity fields; Node checks membership before selecting it.
    const identity = JSON.parse(
      await api.execute("/v1/me", "GET")
    ) as MeResponse;
    const organization =
      identity.data.activeOrganizationId ??
      identity.data.principal.activeOrganizationId ??
      (identity.data.organizations.length === 1
        ? identity.data.organizations[0]?.id
        : undefined);
    if (
      identity.success &&
      organization &&
      identity.data.organizations.some((entry) => entry.id === organization)
    ) {
      return organization;
    }
  } catch (error) {
    if (error instanceof HttpError || error instanceof CliError) {
      throw error;
    }
    throw invalid();
  }
  throw new CliError(
    "usage_error",
    "Select the upload organization with --organization, inth switch, or inth link."
  );
};

export const runResourceUpload = async (
  options: CliArguments,
  api: UploadApi,
  resolveOrganization: () => Promise<string | undefined>,
  signal: AbortSignal,
  apiOrigin: string,
  transfer = putSupportFile
): Promise<string> => {
  const file = await prepareUploadFile(options, signal);
  try {
    if (options.command === "chat") {
      return await uploadChat(
        file,
        api,
        await selectedOrganization(api, resolveOrganization),
        signal
      );
    }
    const clientAttachmentId =
      optionValue(options, "client-attachment-id") ?? randomUUID();
    const state: UploadReceiptData = {
      apiOrigin,
      clientAttachmentId,
      fileName: file.fileName,
      mediaType: file.mediaType,
      organizationId: "",
      schemaVersion: 2,
      sizeBytes: file.sizeBytes,
      stage: "prepared",
    };
    const receiptPath = optionValue(options, "receipt");
    const receipt =
      receiptPath === undefined
        ? undefined
        : new UploadReceipt(receiptPath, state);
    let organization: string;
    try {
      organization = await selectedOrganization(api, resolveOrganization);
      state.organizationId = organization;
      updateReceipt(receipt, state);
    } catch (error) {
      receipt?.discard();
      throw error;
    }
    console.error(
      `Support upload retry ID: ${clientAttachmentId}. Reuse --client-attachment-id ${clientAttachmentId} with the identical file name, media type, size and organization while the intent remains pending.`
    );
    const intentBody = JSON.stringify({
      clientAttachmentId,
      fileName: file.fileName,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes,
    });
    let intent: UploadResponse;
    try {
      intent = metadata(
        await api.execute(
          "/v1/support/attachments",
          "POST",
          intentBody,
          organization
        ),
        file,
        "support",
        organization
      );
    } catch (error) {
      console.error(
        "If the intent response was lost, retry with this same client attachment ID. A conflict does not authorize a new upload."
      );
      throw error;
    }
    const { id } = intent.data.attachment;
    state.attachmentId = id;
    state.stage = "reserved";
    const recovery = `Recover with inth support attachment-finalize ${id} --organization ${terminalText(organization)} --json. Discard an unused upload explicitly with inth support attachment-discard ${id}.`;
    console.error(`Support attachment ID: ${id}. ${recovery}`);
    updateReceipt(receipt, state);
    const grant = intent.data.upload;
    if (!grant || intent.data.attachment.status !== "uploading") {
      throw invalid();
    }
    validateSupportGrant(grant, id, file.mediaType);
    signal.throwIfAborted();
    try {
      await transfer(file, grant, id, signal);
      state.stage = "transferred";
    } catch (error) {
      state.stage = "transfer_unknown";
      updateReceipt(receipt, state);
      signal.throwIfAborted();
      if (error instanceof CliError && error.code === "upload_file_changed") {
        throw error;
      }
      console.error(
        "The storage response did not confirm completion. Checking finalization without sending the file again."
      );
    }
    updateReceipt(receipt, state);
    signal.throwIfAborted();
    try {
      const result = metadata(
        await api.execute(
          `/v1/support/attachments/${id}/finalize`,
          "POST",
          "{}",
          organization
        ),
        file,
        "support",
        organization,
        id
      );
      if (
        !["ready", "attached"].includes(result.data.attachment.status ?? "")
      ) {
        throw invalid();
      }
      state.stage = "ready";
      updateReceipt(receipt, state);
      const data: UploadResultData = {
        attachment: safeAttachment(result.data.attachment),
        clientAttachmentId,
        organizationId: organization,
      };
      if (receipt) {
        data.receiptPath = receipt.path;
      }
      return JSON.stringify({ data, success: true });
    } catch (error) {
      state.stage = "finalize_unknown";
      updateReceipt(receipt, state);
      console.error(recovery);
      signal.throwIfAborted();
      throw new CliError(
        "upload_outcome_unknown",
        `Support upload readiness is unconfirmed. ${recovery} Client attachment ID: ${clientAttachmentId}.`,
        status(error),
        errorRequestId(error)
      );
    }
  } finally {
    file.close();
  }
};
