import "../../src/native/native-bindings.ts";
import { CliError } from "../../src/cli-error.ts";
import { HttpError } from "../../src/http-error.ts";
import { responseError } from "../../src/native/native-protocol.ts";
import { printResult, reportError } from "../../src/output.ts";

const scenario = process.argv.length > 2 ? process.argv[2] : "success";
if (scenario === "http") {
  process.exit(
    reportError(
      true,
      new HttpError(429, "private-error-body", "req-123\n"),
      false
    )
  );
}
if (scenario === "scope") {
  const error = await responseError({
    body: '{"error":"invalid_scope","error_description":"client does not allow scope organizations.read private-error-body"}',
    ok: false,
    requestId: "scope-request",
    status: 400,
  });
  process.exit(reportError(true, error, false));
}
if (scenario === "refresh") {
  process.exit(
    reportError(
      true,
      new CliError(
        "authentication_required",
        "Sign in again",
        400,
        "refresh-id"
      ),
      false
    )
  );
}
if (scenario === "cancel") {
  process.exit(
    reportError(true, new Error("Private cancellation reason"), true)
  );
}
printResult(
  true,
  "Human output must not appear",
  '{"data":[{"id":"one"}],"pagination":{"nextCursor":"next"}}'
);
process.exit(0);
