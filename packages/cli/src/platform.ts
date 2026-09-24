import { homedir } from "node:os";
// eslint-disable-next-line unicorn/import-style -- Scriptc requires named path imports.
import { isAbsolute, join } from "node:path";

export const stateDirectory = (
  platform: string,
  home: string,
  appData?: string,
  xdgState?: string
): string => {
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "com.inth.cli");
  }
  if (platform === "win32") {
    return join(
      appData && isAbsolute(appData)
        ? appData
        : join(home, "AppData", "Roaming"),
      "com.inth.cli"
    );
  }
  return join(
    xdgState && isAbsolute(xdgState) ? xdgState : join(home, ".local", "state"),
    "inth"
  );
};
export const nativeStateDirectory = (): string =>
  stateDirectory(
    process.platform,
    homedir(),
    process.env.APPDATA,
    process.env.XDG_STATE_HOME
  );
