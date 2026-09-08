import { expect, it } from "vitest";

import { runWithCleanup } from "../scripts/native-cleanup.ts";

it("attempts every cleanup and preserves the original workload failure", async () => {
  const original = new Error("workload");
  const attempted: string[] = [];
  await expect(
    runWithCleanup(
      () => Promise.reject(original),
      [
        () => {
          attempted.push("lock");
          return Promise.reject(new Error("cleanup"));
        },
        () => {
          attempted.push("directory");
          return Promise.resolve();
        },
      ]
    )
  ).rejects.toBe(original);
  expect(attempted).toEqual(["lock", "directory"]);
});
it("reports cleanup errors when the workload succeeded", async () => {
  const cleanup = new Error("cleanup");
  await expect(
    runWithCleanup(() => Promise.resolve(), [() => Promise.reject(cleanup)])
  ).rejects.toBe(cleanup);
});
