import { fstatSync, lstatSync, statSync } from "node:fs";
import type { Stats } from "node:fs";

export interface FileSnapshot {
  identity: string;
  info: Stats;
}

type FileIdentityReader = (
  path: string,
  descriptor: number,
  follow: boolean
) => string;

let identityReader: FileIdentityReader | undefined;

export const configureFileIdentityReader = (
  reader: FileIdentityReader
): void => {
  identityReader = reader;
};

const numericIdentity = (info: Stats): string => {
  if (!Number.isSafeInteger(info.dev) || !Number.isSafeInteger(info.ino)) {
    throw new TypeError("Cannot verify an inexact file identity.");
  }
  return `${info.dev}:${info.ino}`;
};

export const pathFileIdentity = (path: string, follow = true): string =>
  identityReader
    ? identityReader(path, -1, follow)
    : numericIdentity(follow ? statSync(path) : lstatSync(path));

export const pathFileSnapshot = (path: string, follow = true): FileSnapshot => {
  // The identity selects the file; path metadata can change before open.
  const identity = identityReader?.(path, -1, follow);
  const info = follow ? statSync(path) : lstatSync(path);
  return { identity: identity ?? numericIdentity(info), info };
};

export const descriptorFileSnapshot = (descriptor: number): FileSnapshot => {
  const info = fstatSync(descriptor);
  return {
    identity: identityReader?.("", descriptor, true) ?? numericIdentity(info),
    info,
  };
};

export const sameFileIdentity = (
  current: FileSnapshot,
  expected: FileSnapshot
): boolean => current.identity === expected.identity;

export const sameFileSnapshot = (
  current: FileSnapshot,
  expected: FileSnapshot
): boolean =>
  sameFileIdentity(current, expected) &&
  current.info.size === expected.info.size &&
  current.info.mtimeMs === expected.info.mtimeMs &&
  current.info.ctimeMs === expected.info.ctimeMs;
