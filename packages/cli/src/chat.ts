import type { CliArguments } from "./arguments.ts";
import { CliError } from "./cli-error.ts";
import { optionValue as value } from "./option-value.ts";
import { validateResourceId as resourceId } from "./resource-validation.ts";

export interface ChatBody {
  message?: string;
  clientMessageId?: string;
  inboxItemId?: string;
  attachmentIds?: string[];
}

const messageText = (input: string, hasAttachments = false): string => {
  const message = input.trim();
  if ((!message && !hasAttachments) || message.length > 50_000) {
    throw new CliError(
      "usage_error",
      "The chat message must contain 1 through 50000 characters after trimming, or provide attachment IDs for an empty message."
    );
  }
  return message;
};

const messageId = (input: string): void => {
  if (
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu.test(
      input
    )
  ) {
    throw new CliError("usage_error", "clientMessageId must be a UUID v4.");
  }
};

export const encodeChatBody = (
  message: string,
  id?: string,
  inbox?: string,
  attachments?: string[]
): string => {
  const fields = [`"message":${JSON.stringify(message)}`];
  if (id !== undefined) {
    fields.push(`"clientMessageId":${JSON.stringify(id)}`);
  }
  if (inbox !== undefined) {
    fields.push(`"inboxItemId":${JSON.stringify(inbox)}`);
  }
  if (attachments !== undefined) {
    fields.push(`"attachmentIds":${JSON.stringify(attachments)}`);
  }
  return `{${fields.join(",")}}`;
};

const checkedAttachments = (ids: string[]): string[] => {
  if (
    !Array.isArray(ids) ||
    ids.length > 10 ||
    !ids.every(
      (id, index) =>
        // eslint-disable-next-line anti-slop/no-runtime-typeof -- Validate the user JSON in Node and at the Scriptc boundary.
        typeof id === "string" &&
        /^aga_[A-Za-z0-9_-]{1,60}$/u.test(id) &&
        ids.indexOf(id) === index
    )
  ) {
    throw new CliError(
      "usage_error",
      "attachmentIds must be a JSON array of up to 10 distinct aga_ attachment IDs."
    );
  }
  return ids;
};

const attachmentOption = (options: CliArguments): string[] | undefined => {
  const source = value(options, "attachment-ids");
  if (source === undefined) {
    return undefined;
  }
  try {
    // SAFETY: Both runtimes check the array and each ID at this boundary.
    return checkedAttachments(JSON.parse(source) as string[]);
  } catch {
    throw new CliError(
      "usage_error",
      "--attachment-ids must be a JSON array of up to 10 distinct aga_ attachment IDs."
    );
  }
};

const jsonBody = (options: CliArguments, source: string): string => {
  let body: ChatBody;
  try {
    // SAFETY: Both runtimes validate the optional strings and attachment array below.
    body = JSON.parse(source) as ChatBody;
    if (!source.trim().startsWith("{")) {
      throw new Error("Expected an object");
    }
    for (const key of Object.keys(body)) {
      if (
        !["message", "clientMessageId", "attachmentIds"].includes(key) &&
        !(options.argument === "start" && key === "inboxItemId")
      ) {
        throw new CliError(
          "usage_error",
          "Chat JSON accepts message, clientMessageId, attachmentIds, and inboxItemId on start only."
        );
      }
    }
    for (const field of [
      body.message,
      body.clientMessageId,
      body.inboxItemId,
    ]) {
      // eslint-disable-next-line anti-slop/no-runtime-typeof -- Validate user JSON in Node as well as the compiled Scriptc boundary.
      if (field !== undefined && typeof field !== "string") {
        throw new CliError(
          "usage_error",
          "Chat message and context fields must be strings."
        );
      }
    }
    if (body.attachmentIds !== undefined) {
      checkedAttachments(body.attachmentIds);
    }
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError(
      "usage_error",
      "Chat --data must be a JSON object with message, clientMessageId, attachmentIds, and optional Inbox context."
    );
  }
  const message = messageText(
    body.message ?? "",
    Boolean(body.attachmentIds?.length)
  );
  if (body.clientMessageId !== undefined) {
    messageId(body.clientMessageId);
  }
  if (body.inboxItemId !== undefined) {
    resourceId(body.inboxItemId, "inboxItemId");
  }
  return encodeChatBody(
    message,
    body.clientMessageId,
    body.inboxItemId,
    body.attachmentIds
  );
};

export const validateChatOptions = (options: CliArguments): void => {
  if (options.id) {
    resourceId(options.id, "Chat ID");
  }
  if (options.organization !== undefined) {
    resourceId(options.organization, "--organization");
  }
  if (!["start", "send"].includes(options.argument)) {
    return;
  }
  const data = value(options, "data");
  const dataFile = value(options, "data-file");
  const message = value(options, "message");
  const messageFile = value(options, "message-file");
  if (data !== undefined || dataFile !== undefined) {
    if (data !== undefined) {
      jsonBody(options, data);
    }
    return;
  }
  const attachments = attachmentOption(options);
  if (message !== undefined && messageFile !== undefined) {
    throw new CliError(
      "usage_error",
      "Use --message or --message-file, not both."
    );
  }
  if (messageFile === undefined) {
    messageText(message ?? "", Boolean(attachments?.length));
  }
  const id = value(options, "client-message-id");
  if (id !== undefined) {
    messageId(id);
  }
  const inbox = value(options, "inbox-item");
  if (inbox !== undefined) {
    resourceId(inbox, "--inbox-item");
  }
};

export const chatBody = (options: CliArguments): string | undefined => {
  const data = value(options, "data");
  if (data !== undefined) {
    return jsonBody(options, data);
  }
  if (
    value(options, "data-file") !== undefined ||
    value(options, "message-file") !== undefined
  ) {
    return undefined;
  }
  const attachments = attachmentOption(options);
  return encodeChatBody(
    messageText(value(options, "message") ?? "", Boolean(attachments?.length)),
    value(options, "client-message-id"),
    value(options, "inbox-item"),
    attachments
  );
};

export const requireChatPerson = (
  options: CliArguments,
  key?: string
): void => {
  if (options.command === "chat" && key) {
    throw new CliError(
      "usage_error",
      "Chats require a person's approved sign-in. Unset INTH_TOKEN and omit --token, then use inth login or --auth agent."
    );
  }
};

export const chatRetryDiagnostic = (
  options: CliArguments
): string | undefined => {
  if (!options.generatedClientMessageId) {
    return undefined;
  }
  const id = options.generatedClientMessageId;
  if (value(options, "data") !== undefined) {
    return `Chat retry ID: ${id}. Set "clientMessageId":"${id}" in the JSON body for --data or --data-file, keeping the same message and ordered attachment IDs when retrying.`;
  }
  return `Chat retry ID: ${id}. Reuse --client-message-id ${id} with the same message and ordered attachment IDs when retrying.`;
};
