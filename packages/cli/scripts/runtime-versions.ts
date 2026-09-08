import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { resolveManifest } from "./resolve-manifest.ts";

export const YAO_NODE_VERSION = "24.20.0";
export const packageVersion = (name: string): string =>
  z
    .object({ version: z.string().min(1) })
    .parse(
      JSON.parse(
        readFileSync(
          resolveManifest(name, fileURLToPath(new URL("../", import.meta.url))),
          "utf-8"
        )
      )
    ).version;
