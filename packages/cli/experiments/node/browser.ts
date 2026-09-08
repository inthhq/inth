import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { httpsUrl } from "./protocol.ts";

const execFileAsync = promisify(execFile);
export const openBrowser = async (value: string): Promise<void> => {
  const url = httpsUrl.parse(value);
  if (process.platform === "darwin") {
    await execFileAsync("/usr/bin/open", [url], { timeout: 10_000 });
    return;
  }
  if (process.platform === "win32") {
    await execFileAsync("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
      timeout: 10_000,
    });
    return;
  }
  await execFileAsync("xdg-open", [url], { timeout: 10_000 });
};
