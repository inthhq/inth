#!/usr/bin/env node
import { HELP, VERSION } from "../../src/help.ts";
import { reportError } from "../../src/output.ts";

const args = process.argv.slice(2);
// Keep help and version independent of networking and native credential bindings.
if (
  args.length === 0 ||
  (args.length === 1 && (args[0] === "--help" || args[0] === "-h"))
) {
  console.log(HELP);
} else if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
  console.log(VERSION);
} else {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const { run } = await import("./commands.ts");
    await run(args, controller.signal);
  } catch (error) {
    process.exitCode = reportError(
      args.includes("--json"),
      error instanceof Error ? error : new Error("Command failed."),
      controller.signal.aborted
    );
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
