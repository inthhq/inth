import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import type { ResourceCommand } from "./resource-commands.ts";

const attachment = (
  group: string,
  action: string,
  method: string,
  path: string,
  description: string,
  fields: string[] = []
): ResourceCommand => ({
  action,
  command: group,
  description,
  fields,
  method,
  paginated: false,
  path,
  personOnly: true,
  required: action === "attachment-upload" ? ["file"] : [],
  rules: [],
  scoped: true,
  scopes: [
    `${group === "chat" ? "agents" : "support"}.${method === "GET" ? "read" : "write"}`,
  ],
  upload: action === "attachment-upload",
});

export const UPLOAD_COMMANDS: ResourceCommand[] = [
  attachment(
    "chat",
    "attachment-upload",
    "POST",
    "/v1/agent-chat-attachments",
    "Upload one ready chat draft without sending a message",
    ["file", "file-name", "media-type"]
  ),
  attachment(
    "chat",
    "attachment-list",
    "GET",
    "/v1/agent-chat-attachments",
    "Discover ready and uploading drafts, including after a lost upload response"
  ),
  {
    ...attachment(
      "chat",
      "attachment-get",
      "GET",
      "/v1/agent-chat-attachments/:id/content",
      "Download a chat attachment",
      ["output"]
    ),
    download: "*/*",
    required: ["output"],
    scoped: false,
  },
  attachment(
    "chat",
    "attachment-discard",
    "DELETE",
    "/v1/agent-chat-attachments/:id",
    "Discard one unused chat draft"
  ),
  attachment(
    "support",
    "attachment-upload",
    "POST",
    "/v1/support/attachments",
    "Upload and finalize one Support image or recording",
    ["file", "file-name", "media-type", "client-attachment-id", "receipt"]
  ),
  {
    ...attachment(
      "support",
      "attachment-finalize",
      "POST",
      "/v1/support/attachments/:id/finalize",
      "Recover a known Support upload without sending bytes again"
    ),
    body: "{}",
  },
  attachment(
    "support",
    "attachment-discard",
    "DELETE",
    "/v1/support/attachments/:id",
    "Discard one unused Support attachment"
  ),
];

export const validateAttachmentOptions = (options: CliArguments): void => {
  if (
    !UPLOAD_COMMANDS.some(
      (entry) =>
        entry.command === options.command && entry.action === options.argument
    )
  ) {
    return;
  }
  if (
    options.command === "chat" &&
    options.id &&
    !/^aga_[A-Za-z0-9_-]{1,60}$/u.test(options.id)
  ) {
    throw new CliError(
      "usage_error",
      "Use the aga_ attachment ID returned by chat attachment-upload or attachment-list."
    );
  }
  const id = options.values.find(
    (entry) => entry.name === "client-attachment-id"
  )?.value;
  if (
    id !== undefined &&
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(id)
  ) {
    throw new CliError("usage_error", "--client-attachment-id must be a UUID.");
  }
};
