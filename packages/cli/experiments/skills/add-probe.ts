import { runAdd } from "./inrepo_modules/skills/src/add.ts";
import { flushTelemetry } from "./inrepo_modules/skills/src/telemetry.ts";

await runAdd(process.argv.slice(2), { list: true });
await flushTelemetry();
