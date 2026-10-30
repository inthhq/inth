import { configureFileIdentityReader } from "../file-identity.ts";
import { fileIdentity } from "./native-bindings.ts";

export const nativeFileIdentity = (
  path: string,
  descriptor: number,
  follow: boolean
): string => {
  let identity = "";
  const status = fileIdentity(path, descriptor, follow ? 1 : 0, (value) => {
    identity = value;
  });
  if (status === 1) {
    throw new Error("ENOENT: file identity is unavailable.");
  }
  if (status !== 0 || !identity) {
    throw new Error("Cannot read the exact file identity.");
  }
  return identity;
};

configureFileIdentityReader(nativeFileIdentity);
