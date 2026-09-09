import { Client } from "./inrepo_modules/@sentry/core/src/client.ts";
import type { Event } from "./inrepo_modules/@sentry/core/src/types/event.ts";
import type { ClientOptions } from "./inrepo_modules/@sentry/core/src/types/options.ts";
import { serializeEnvelope } from "./inrepo_modules/@sentry/core/src/utils/envelope.ts";

let captured = "";

class ProbeClient extends Client {
  // eslint-disable-next-line no-useless-constructor -- Exposes the SDK's protected constructor.
  constructor(options: ClientOptions) {
    super(options);
  }

  // eslint-disable-next-line class-methods-use-this, anti-slop/no-unknown-parameters -- Implements the SDK's abstract exception boundary.
  eventFromException(exception: unknown): PromiseLike<Event> {
    return Promise.resolve({
      exception: {
        values: [
          {
            type: exception instanceof Error ? exception.name : "Error",
            value:
              exception instanceof Error ? exception.message : "Unknown error",
          },
        ],
      },
      platform: "javascript",
    });
  }

  // eslint-disable-next-line class-methods-use-this -- Implements the SDK's abstract instance method.
  eventFromMessage(message: string): PromiseLike<Event> {
    return Promise.resolve({ message });
  }
}

const client = new ProbeClient({
  dsn: "https://public@example.invalid/1",
  integrations: [],
  release: "inth-cli@probe",
  sendClientReports: false,
  stackParser: () => [],
  transport: () => ({
    flush: () => Promise.resolve(true),
    send: (envelope) => {
      const serialized = serializeEnvelope(envelope);
      // eslint-disable-next-line anti-slop/no-runtime-typeof -- Sentry returns a string or Uint8Array; this probe expects text.
      if (typeof serialized !== "string") {
        throw new TypeError("Expected a text envelope");
      }
      captured = serialized;
      return Promise.resolve({ statusCode: 200 });
    },
  }),
});

client.init();
client.captureException(new Error("Sentry compatibility probe"));
const flushed = await client.flush(1500);
if (
  !flushed ||
  !captured.includes("Sentry compatibility probe") ||
  !captured.includes("inth-cli@probe")
) {
  throw new Error("Sentry did not flush the expected exception envelope");
}
console.log("Sentry core captured and flushed the exception envelope.");
