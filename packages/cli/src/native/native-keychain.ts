import { diagnosticStep } from "../error-diagnostics.ts";
import { secretRead, secretWrite, secretDelete } from "./native-bindings.ts";

const credentialError = (operation: string, status: number): string =>
  status === -3
    ? "The system credential store is unavailable. On Linux, install libsecret and unlock a Secret Service keyring, or supply INTH_TOKEN for headless use."
    : `System credential store ${operation} failed (${status}).`;

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
      throw new Error(credentialError("read", status));
    }
    return value;
  }
  write(value: string): void {
    diagnosticStep("credential_write");
    const status = secretWrite(this.service, this.account, value);
    if (status !== 0) {
      throw new Error(credentialError("write", status));
    }
  }
  clear(): void {
    diagnosticStep("credential_delete");
    const status = secretDelete(this.service, this.account);
    if (status !== 0 && status !== -25_300) {
      throw new Error(credentialError("deletion", status));
    }
  }
}
