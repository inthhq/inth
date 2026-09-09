import {
  sentryProbeCapture,
  sentryProbeClose,
  sentryProbeCrash,
  sentryProbeInit,
} from "./bindings.ts";

const mode = process.argv[2] || "capture";
if (process.env.INTH_TELEMETRY_DISABLED === "1") {
  console.log("disabled");
  process.exit(0);
}
if (
  sentryProbeInit(
    process.env.PROBE_DSN || "",
    process.env.PROBE_DATABASE || ""
  ) !== 0
) {
  process.exit(1);
}
if (mode === "crash") {
  sentryProbeCrash();
} else if (mode === "capture") {
  try {
    throw new Error("Synthetic native Sentry probe");
  } catch {
    // Fixed synthetic details only. This stack starts at capture, after the catch.
    if (sentryProbeCapture() !== 0) {
      sentryProbeClose();
      process.exit(2);
    }
  }
}
console.log(`flush=${sentryProbeClose()}`);
process.exit(0);
