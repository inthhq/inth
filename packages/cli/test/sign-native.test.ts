import { expect, it } from "vitest";

import { signingIdentity } from "../scripts/sign-native.ts";

it("requires a certificate when persistent signing is requested", () => {
  expect(signingIdentity()).toBeUndefined();
  expect(signingIdentity(" Apple Development: Local Developer ")).toBe(
    "Apple Development: Local Developer"
  );
  for (const value of ["", " ", "-", "--sign"]) {
    expect(() => signingIdentity(value)).toThrow("certificate identity");
  }
});
