import { HELP, VERSION } from "../src/help.ts";

// This probe exercises the actual help text, not authentication or credential storage.
if (process.argv.length > 2 && process.argv[2] === "--version") {
  console.log(VERSION);
} else {
  console.log(HELP);
}
