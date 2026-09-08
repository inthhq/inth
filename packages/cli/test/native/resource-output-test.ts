import { parseArguments } from "../../src/arguments.ts";
import { CliError } from "../../src/cli-error.ts";
import { colorEnabled, textWidth } from "../../src/display.ts";
import { outputColumns } from "../../src/native/native-bindings.ts";
import { formatNativeResource } from "../../src/native/native-resource-output.ts";
import { printResult } from "../../src/output.ts";
import {
  billingBody,
  outputCases,
  projectsBody,
} from "../fixtures/resource-output.ts";

const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
if (process.argv.includes("--billing") || process.argv.includes("--projects")) {
  const args = process.argv.includes("--billing")
    ? ["billing"]
    : ["project", "list"];
  if (process.argv.includes("--json")) {
    args.push("--json");
  }
  const options = parseArguments(args);
  const body = process.argv.includes("--billing") ? billingBody : projectsBody;
  const output = options.json
    ? ""
    : formatNativeResource(
        options,
        { body, ok: true, requestId: null, status: 200 },
        {
          color: colorEnabled(Boolean(process.stdout.isTTY)),
          columns: outputColumns(),
        }
      );
  printResult(options.json, output, body);
  process.exit(0);
}
for (const example of outputCases) {
  const output = formatNativeResource(
    parseArguments(example.args),
    { body: example.body, ok: true, requestId: "output-id", status: 200 },
    { color: false, columns: 120 }
  );
  for (const expected of example.expected) {
    check(
      output.includes(expected),
      `Missing ${expected} in ${example.args.join(" ")}`
    );
  }
  check(!output.includes('"success"'), "Human output contains JSON");
}
const narrow = formatNativeResource(
  parseArguments(["project", "list"]),
  { body: projectsBody, ok: true, requestId: null, status: 200 },
  { color: false, columns: 24 }
);
for (const line of narrow.split("\n")) {
  check(textWidth(line) < 24, "Output exceeds terminal width");
}
let rejected = false;
try {
  formatNativeResource(
    parseArguments(["billing"]),
    {
      body: '{"success":true,"data":{"credits":{"remaining":"bad","unlimited":true}}}',
      ok: true,
      requestId: "bad-output",
      status: 200,
    },
    { color: false, columns: 80 }
  );
} catch (error) {
  rejected = error instanceof CliError && error.requestId === "bad-output";
}
check(
  rejected,
  "Malformed display fields were accepted or lost the request ID"
);
console.log(
  "Native resource formatting: billing, lists, details, mutations, narrow terminals, and validation passed."
);
process.exit(0);
