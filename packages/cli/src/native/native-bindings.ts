export declare function productionBuild(): number;
export declare function secretRead(
  service: string,
  account: string,
  receive: (value: string) => void
): number;
export declare function secretWrite(
  service: string,
  account: string,
  value: string
): number;
export declare function secretDelete(service: string, account: string): number;
export declare function lockAcquire(path: string): number;
export declare function lockRelease(handle: number): number;
export declare function httpDate(value: string): number;
export declare function removeDirectory(path: string): number;
export declare function prepareDirectory(path: string): number;
export declare function openBrowser(url: string): number;
// Returns 1 for a valid URL and 0 for an invalid URL.
export declare function browserUrlValid(url: string): number;

export declare function writeConfig(path: string, value: string): number;
/** Atomically save an MCP config, preserving existing file permissions. */
export declare function writeMcpConfig(path: string, value: string): number;

export declare function terminalBegin(): number;
export declare function terminalEnd(): number;
export declare function terminalKey(): number;
export declare function terminalRows(): number;
export declare function outputColumns(): number;
export declare function terminalLine(value: string): number;

export declare function mcpTomlStatus(source: string): number;
export declare function sentryCapture(
  dsn: string,
  release: string,
  command: string,
  type: string,
  diagnostic: string,
  userId: string,
  database: string,
  receive: (envelope: string) => void
): number;
