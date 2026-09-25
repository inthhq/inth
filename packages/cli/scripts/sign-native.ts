import { spawnSync } from "node:child_process";

export const signingIdentity = (value?: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const identity = value.trim();
  if (!identity || identity.startsWith("-")) {
    throw new Error(
      "INTH_CODESIGN_IDENTITY must name a certificate identity. Ad hoc signing does not preserve Keychain trust across changed builds."
    );
  }
  return identity;
};
export const signNative = (
  binary: string,
  identity: string | undefined
): void => {
  if (!identity) {
    return;
  }
  const signed = spawnSync(
    "/usr/bin/codesign",
    [
      "--force",
      "--sign",
      identity,
      "--identifier",
      "com.inth.cli",
      // Match release signing.
      "--options",
      "runtime",
      binary,
    ],
    { encoding: "utf-8", timeout: 120_000 }
  );
  if (signed.status !== 0) {
    throw new Error(
      signed.stderr ||
        "Native code signing failed. Check INTH_CODESIGN_IDENTITY and unlock the signing keychain."
    );
  }
  const verified = spawnSync(
    "/usr/bin/codesign",
    ["--verify", "--strict", binary],
    { encoding: "utf-8", timeout: 30_000 }
  );
  if (verified.status !== 0) {
    throw new Error(verified.stderr || "Native signature verification failed.");
  }
};
