import { secretRead, secretWrite, secretDelete } from "./native-bindings.ts";

export class NativeKeychain {
  private readonly service: string;
  private readonly account: string;
  constructor(service: string, account: string) {
    this.service = service;
    this.account = account;
  }
  read(): string | null {
    let value: string | null = null;
    const status = secretRead(this.service, this.account, (received) => {
      value = received;
    });
    if (status === -25_300) {
      return null;
    }
    if (status !== 0) {
      throw new Error(`Keychain read failed (${status}).`);
    }
    return value;
  }
  write(value: string): void {
    const status = secretWrite(this.service, this.account, value);
    if (status !== 0) {
      throw new Error(`Keychain write failed (${status}).`);
    }
  }
  clear(): void {
    const status = secretDelete(this.service, this.account);
    if (status !== 0 && status !== -25_300) {
      throw new Error(`Keychain deletion failed (${status}).`);
    }
  }
}
