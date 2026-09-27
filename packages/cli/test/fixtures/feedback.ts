import { parseArguments } from "../../src/arguments.ts";
import { buildResourceRequest } from "../../src/resource-commands.ts";

export const checkFeedbackIds = (): void => {
  const inputs = [
    [
      "feedback",
      "--category",
      "bug",
      "--surface",
      "cli",
      "--message",
      "Command failed",
    ],
    [
      "feedback",
      "--data",
      '{"category":"bug","surface":"cli","message":"Command failed","extra":{"preserved":true}}',
    ],
  ];
  for (const args of inputs) {
    const options = parseArguments(args);
    const request = buildResourceRequest(options);
    // SAFETY: The request builder creates the ID; check its public wire format in both runtimes.
    const payload = JSON.parse(request.body ?? "{}") as {
      clientSubmissionId: string;
    };
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        payload.clientSubmissionId
      )
    ) {
      throw new Error("Feedback needs an automatically generated UUID v4.");
    }
    if (buildResourceRequest(options).body !== request.body) {
      throw new Error(
        "Rebuilding a feedback request changed its submission ID."
      );
    }
    if (buildResourceRequest(parseArguments(args)).body === request.body) {
      throw new Error("Separate feedback invocations reused a submission ID.");
    }
    if (
      args[1] === "--data" &&
      !request.body?.includes('"extra":{"preserved":true}')
    ) {
      throw new Error("Generating a submission ID lost raw body fields.");
    }
  }
};
