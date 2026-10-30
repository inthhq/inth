import type { Stats } from "node:fs";

export const sameFileIdentity = (current: Stats, expected: Stats): boolean =>
  current.dev === expected.dev && current.ino === expected.ino;

export const sameFileSnapshot = (current: Stats, expected: Stats): boolean =>
  sameFileIdentity(current, expected) &&
  current.size === expected.size &&
  current.mtimeMs === expected.mtimeMs &&
  current.ctimeMs === expected.ctimeMs;
