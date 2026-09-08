import { Entry } from "@napi-rs/keyring";

// Compile-only compatibility probe. Do not run against a person's credentials.
const entry = new Entry("com.inth.cli.compiler-probe", "probe");
console.log(entry.getPassword() === null ? "absent" : "present");
