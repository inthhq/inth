import { expect, it } from "vitest";

import { summarize } from "../scripts/benchmark-stats.ts";

it("uses the midpoint median and nearest-rank p95 for the sample count", () => {
  expect(summarize([4, 1, 3, 2])).toEqual({ median: 2.5, p95: 4 });
  expect(summarize([3, 1, 2])).toEqual({ median: 2, p95: 3 });
  expect(summarize([7])).toEqual({ median: 7, p95: 7 });
  expect(
    summarize(Array.from({ length: 100 }, (_, index) => index + 1))
  ).toEqual({ median: 50.5, p95: 95 });
  expect(() => summarize([])).toThrow("finite benchmark samples");
  expect(() => summarize([Number.NaN])).toThrow("finite benchmark samples");
});
