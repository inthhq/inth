import { readFileSync } from "node:fs";
// eslint-disable-next-line unicorn/import-style -- Matches the native sources.
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import {
  INTH_PROJECT_HOST_SUFFIXES,
  normalizeProjectUrl,
  ProjectUrlError,
} from "../../src/native/mobile/project-url.ts";

const REPO = join(import.meta.dirname, "../../../..");

interface AcceptCase {
  input: string;
  normalized: string;
}
interface RejectCase {
  input: string;
  reason: string;
}
interface Cases {
  accept: AcceptCase[];
  reject: RejectCase[];
}
interface Fixture {
  allowedHostSuffixes: string[];
  relaxed: Cases;
  strict: Cases;
}

// SAFETY: The shared fixture's shape is fixed by Swift, Kotlin and TypeScript tests.
const fixture = JSON.parse(
  readFileSync(
    join(REPO, "packages/native-protocol/project-url/cases.json"),
    "utf-8"
  )
) as Fixture;

const reasonOf = (input: string, relaxed: boolean): string => {
  try {
    normalizeProjectUrl(input, "--backend-url", relaxed);
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectUrlError);
    return error instanceof ProjectUrlError ? error.reason : "";
  }
  return "";
};

interface ExpoProjectUrl {
  normalizeProjectUrl: (
    input: string,
    options: { relaxed: boolean; option: string }
  ) => string;
}

describe("the Inth project URL rule", () => {
  it("allows the host suffixes the shared fixture lists", () => {
    expect(INTH_PROJECT_HOST_SUFFIXES).toStrictEqual(
      fixture.allowedHostSuffixes
    );
  });

  describe.each([
    ["strict", false],
    ["relaxed", true],
  ] as const)("%s", (name, relaxed) => {
    it.each(fixture[name].accept)(
      "accepts $input as $normalized",
      ({ input, normalized }) => {
        expect(normalizeProjectUrl(input, "--backend-url", relaxed)).toBe(
          normalized
        );
      }
    );

    it.each(fixture[name].reject)("refuses $input: $reason", (entry) => {
      expect(reasonOf(entry.input, relaxed)).toBe(entry.reason);
    });
  });

  it("refuses with the same message as the Expo plugin, under the flag name", async () => {
    // Loaded at run time: the React Native package's source is not type-checked here.
    // SAFETY: The plugin module exports normalizeProjectUrl with this signature.
    const expo = (await import(
      pathToFileURL(
        join(REPO, "packages/react-native/src/expo-plugin/project-url.ts")
      ).href
    )) as ExpoProjectUrl;
    for (const relaxed of [false, true]) {
      const cases = relaxed ? fixture.relaxed : fixture.strict;
      for (const { input } of cases.reject) {
        let plugin = "";
        try {
          expo.normalizeProjectUrl(input, { option: "--backend-url", relaxed });
        } catch (error) {
          plugin = error instanceof Error ? error.message : "";
        }
        expect(
          () => normalizeProjectUrl(input, "--backend-url", relaxed),
          input
        ).toThrow(plugin);
      }
    }
    expect(() =>
      normalizeProjectUrl("https://consent.example.com", "--backend-url")
    ).toThrow(
      '--backend-url must be the project URL from your Inth dashboard, such as https://your-project.inth.app. Got "https://consent.example.com": the host must be a project host under inth.app.'
    );
  });
});
