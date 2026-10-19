import { describe, expect, it } from "vitest";

import {
  intersects,
  minVersion,
  parse,
  subset,
  valid,
  validRange,
} from "../src/native/c15t-codemods/semver.ts";

const options = { includePrerelease: true };

// Values from npm's `semver` 7.8.5 for the questions the codemods ask:
// the lowest major, whether the range is all within 3, whether it allows
// some 3, whether it allows something below 3, and something at 3 or above.
const RANGES: [string, [number, boolean, boolean, boolean, boolean] | null][] =
  [
    ["^2.0.0", [2, false, false, true, false]],
    ["^2.3.1", [2, false, false, true, false]],
    ["~3.1", [3, true, true, false, true]],
    ["~3", [3, true, true, false, true]],
    ["3.x", [3, true, true, false, true]],
    ["3", [3, true, true, false, true]],
    ["2.x || 3.x", [2, false, true, true, true]],
    ["^3 || ^4", [3, false, true, false, true]],
    [">=2 <4", [2, false, true, true, true]],
    ["*", [0, false, true, true, true]],
    ["latest", null],
    ["1.2.3 - 2.3.4", [1, false, false, true, false]],
    ["1.2 - 3", [1, false, true, true, true]],
    [">= 3.0.0", [3, false, true, false, true]],
    ["<3", [0, false, false, true, false]],
    ["<=3.x", [0, false, true, true, true]],
    [">2.x", [3, false, true, false, true]],
    ["3.0.0-canary.2", [3, true, true, false, true]],
    ["^3.0.0-alpha.1", [3, true, true, false, true]],
    ["^0.1.2", [0, false, false, true, false]],
    ["^0.0.3", [0, false, false, true, false]],
    ["~0.2", [0, false, false, true, false]],
    ["=3.1.0", [3, true, true, false, true]],
    ["v3.1.0", [3, true, true, false, true]],
    ["01.2.3", null],
    ["~>3.1", [3, true, true, false, true]],
    ["3.1.x", [3, true, true, false, true]],
  ];

describe("c15t codemod semver", () => {
  it.each(RANGES)("answers like semver for %s", (range, expected) => {
    expect(validRange(range) === null).toBe(expected === null);
    if (expected === null) {
      return;
    }
    expect([
      minVersion(range)?.major,
      subset(range, ">=3.0.0-0 <4.0.0", options),
      intersects(range, ">=3.0.0-0 <4.0.0", options),
      intersects(range, "<3.0.0-0", options),
      intersects(range, ">=3.0.0-0", options),
    ]).toEqual(expected);
  });

  it("parses versions strictly", () => {
    expect(valid("v3.1.0+build")).toBe("3.1.0");
    expect(valid("3.1")).toBeNull();
    expect(valid("01.1.0")).toBeNull();
    expect(parse("3.1.0-canary.2")?.prerelease).toEqual(["canary", "2"]);
  });
});
