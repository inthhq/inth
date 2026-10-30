import { fstatSync, lstatSync, statSync } from "node:fs";

import { configureFileIdentityReader } from "../../src/file-identity.ts";

configureFileIdentityReader((path, descriptor, follow) => {
  if (descriptor >= 0) {
    const info = fstatSync(descriptor, { bigint: true });
    return `${info.dev}:${info.ino}`;
  }
  const info = follow
    ? statSync(path, { bigint: true })
    : lstatSync(path, { bigint: true });
  return `${info.dev}:${info.ino}`;
});
