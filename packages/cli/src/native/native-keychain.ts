import { CliError } from "../cli-error.ts";
import { diagnosticStep } from "../error-diagnostics.ts";
import { secretRead, secretWrite, secretDelete } from "./native-bindings.ts";

// Linux Secret Service statuses from native-secret-linux.c. An unavailable
// store is an environment problem the user can fix, not a CLI bug.
const UNAVAILABLE = new Map([
  [
    -3,
    "The system credential store is unavailable because libsecret is not installed. Install libsecret, or supply INTH_TOKEN for headless use.",
  ],
  [
    -4,
    "The system credential store is unavailable because the session bus cannot be reached. Run inth in a desktop session, or supply INTH_TOKEN for headless use.",
  ],
  [
    -5,
    "The system credential store is unavailable because no Secret Service is running. Start a keyring such as GNOME Keyring or KWallet, or supply INTH_TOKEN for headless use.",
  ],
]);
const credentialError = (operation: string, status: number): Error => {
  // macOS passes OSStatus through, where -4 is errSecUnimplemented.
  const unavailable =
    process.platform === "linux" ? UNAVAILABLE.get(status) : undefined;
  return unavailable
    ? new CliError("credential_store_unavailable", unavailable)
    : new Error(`System credential store ${operation} failed (${status}).`);
};

export class NativeKeychain {
  private readonly service: string;
  private readonly account: string;
  constructor(service: string, account: string) {
    this.service = service;
    this.account = account;
  }
  read(): string | null {
    diagnosticStep("credential_read");
    let value: string | null = null;
    const status = secretRead(this.service, this.account, (received) => {
      value = received;
    });
    if (status === -25_300) {
      return null;
    }
    if (status !== 0) {
      throw credentialError("read", status);
    }
    return value;
  }
  write(value: string): void {
    diagnosticStep("credential_write");
    const status = secretWrite(this.service, this.account, value);
    if (status !== 0) {
      throw credentialError("write", status);
    }
  }
  clear(): void {
    diagnosticStep("credential_delete");
    const status = secretDelete(this.service, this.account);
    if (status !== 0 && status !== -25_300) {
      throw credentialError("deletion", status);
    }
  }
}
