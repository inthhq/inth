/* eslint-disable max-classes-per-file -- Related in-memory dependencies for protocol tests. */
import type { CredentialStore } from "../experiments/node/auth.ts";
import { HttpClient } from "../experiments/node/http.ts";
import type { Clock, Fetch } from "../experiments/node/http.ts";
import type { Credentials } from "../experiments/node/protocol.ts";

export const metadata = {
  device_authorization_endpoint: "https://dashboard.example/device-start",
  issuer: "https://dashboard.example/auth",
  revocation_endpoint: "https://dashboard.example/revoke-session",
  token_endpoint: "https://dashboard.example/exchange",
};
export const device = {
  device_code: "device-secret",
  expires_in: 600,
  interval: 5,
  user_code: "ABCD-EFGH",
  verification_uri: "https://dashboard.example/device",
  verification_uri_complete:
    "https://dashboard.example/device?user_code=ABCD-EFGH",
};
export const tokens = {
  access_token: "access-secret",
  expires_in: 900,
  refresh_token: "refresh-secret",
  token_type: "Bearer",
};
export const credentials = {
  access_token: "old-access",
  expires_at: 1,
  refresh_token: "old-refresh",
};

export class MemoryStore implements CredentialStore {
  value: Credentials | null;
  writes: Credentials[] = [];
  clears = 0;
  reads = 0;
  private tail: Promise<void> = Promise.resolve();
  constructor(value: Credentials | null = null) {
    this.value = value;
  }
  read(): Promise<Credentials | null> {
    this.reads += 1;
    return Promise.resolve(this.value);
  }
  write(value: Credentials): Promise<void> {
    this.value = value;
    this.writes.push(value);
    return Promise.resolve();
  }
  clear(): Promise<void> {
    this.value = null;
    this.clears += 1;
    return Promise.resolve();
  }
  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    // eslint-disable-next-line typescript/no-invalid-void-type -- This resolver releases a mutex and carries no value.
    const { promise, resolve: unlock } = Promise.withResolvers<void>();
    this.tail = promise;
    await previous;
    try {
      return await work();
    } finally {
      unlock();
    }
  }
}

export class TestClock implements Clock {
  time = 1_000_000;
  waits: number[] = [];
  now = (): number => this.time;
  sleep = (milliseconds: number): Promise<void> => {
    this.waits.push(milliseconds);
    this.time += milliseconds;
    return Promise.resolve();
  };
}
export class Server {
  readonly calls: { url: string; init: RequestInit }[] = [];
  private readonly responses: Response[];
  constructor(responses: Response[]) {
    this.responses = responses;
  }
  fetch: Fetch = (url, init) => {
    this.calls.push({ init, url });
    const response = this.responses.shift();
    if (!response) {
      throw new Error(`Unexpected request to ${url}`);
    }
    return Promise.resolve(response);
  };
}
export const setup = (responses: Response[], store = new MemoryStore()) => {
  const server = new Server(responses);
  const clock = new TestClock();
  const controller = new AbortController();
  const http = new HttpClient(server.fetch, clock, controller.signal);
  return { clock, controller, http, server, store };
};
