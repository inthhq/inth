import { expect, it } from "vitest";

import { publicGenerationPlan } from "../src/native/c15t-generation.ts";

it("exports file metadata without exposing or removing internal contents", () => {
  const plan = {
    dependencies: ["c15t@3"],
    files: [{ content: "TOKEN=secret\n", exists: true, path: ".env" }],
    instructions: ["Add the public backend URL to .env"],
    root: "/app",
  };
  expect(publicGenerationPlan(plan)).toEqual({
    dependencies: ["c15t@3"],
    files: [{ exists: true, path: ".env" }],
    instructions: ["Add the public backend URL to .env"],
    root: "/app",
  });
  expect(plan.files[0]?.content).toBe("TOKEN=secret\n");
});
