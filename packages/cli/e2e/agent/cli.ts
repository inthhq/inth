import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const binary = fileURLToPath(
  new URL(
    `../../build/native/agent-e2e${process.platform === "win32" ? ".exe" : ""}`,
    import.meta.url
  )
);

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface CliProcess {
  child: ReturnType<typeof spawn>;
  finished: () => boolean;
  output: () => string;
  result: Promise<CliResult>;
}

export const launch = (
  directory: string,
  account: string,
  args: string[],
  environment: Record<string, string> = {}
): CliProcess => {
  const child = spawn(binary, [directory, account, ...args, "--json"], {
    env: {
      ...process.env,
      ...environment,
      INTH_TELEMETRY_DISABLED: "1",
      INTH_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let finished = false;
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  // eslint-disable-next-line promise/avoid-new -- Adapt child-process completion and spawn errors.
  const result = new Promise<CliResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      finished = true;
      resolve({ code, stderr, stdout });
    });
  });
  return { child, finished: () => finished, output: () => stdout, result };
};
