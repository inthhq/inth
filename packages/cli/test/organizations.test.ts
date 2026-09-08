import { describe, expect, it } from "vitest";

import {
  chooseOrganization,
  collectOrganizations,
} from "../src/organizations.ts";
import type { Organization, OrganizationUI } from "../src/organizations.ts";

const organizations: Organization[] = [
  {
    id: "org-one",
    name: "One",
    role: "owner",
    slug: "one",
  },
  {
    id: "org-two",
    name: "Two",
    role: "member",
    slug: "two",
  },
];
const silent: OrganizationUI = {
  interactive: false,
  select: () => Promise.reject(new Error("Unexpected prompt")),
};
describe("organization selection", () => {
  it("passes memberships to the selector on first login", async () => {
    const chosen = await chooseOrganization(
      organizations,
      undefined,
      undefined,
      {
        interactive: true,
        select: (choices) => {
          expect(choices).toEqual(organizations);
          return Promise.resolve("org-two");
        },
      }
    );
    expect(chosen).toBe("org-two");
  });
  it("rejects a selection outside the available memberships", async () => {
    await expect(
      chooseOrganization(organizations, undefined, undefined, {
        interactive: true,
        select: () => Promise.resolve("unrelated"),
      })
    ).rejects.toThrow("Invalid organization selection");
  });
  it("keeps an accessible default on subsequent login", async () => {
    expect(
      await chooseOrganization(organizations, undefined, "org-two", silent)
    ).toBe("org-two");
  });
  it("accepts explicit IDs or slugs and overrides a saved default", async () => {
    expect(
      await chooseOrganization(organizations, "one", "org-two", silent)
    ).toBe("org-one");
    expect(
      await chooseOrganization(organizations, "org-one", undefined, silent)
    ).toBe("org-one");
    await expect(
      chooseOrganization(organizations, "unrelated", undefined, silent)
    ).rejects.toThrow("not available");
  });
  it("automatically selects the only membership and handles no memberships", async () => {
    expect(
      await chooseOrganization(
        organizations.slice(0, 1),
        undefined,
        undefined,
        silent
      )
    ).toBe("org-one");
    await expect(
      chooseOrganization([], undefined, undefined, silent)
    ).rejects.toThrow("inth org create");
  });
  it("does not reuse an inaccessible default or guess in a non-interactive shell", async () => {
    await expect(
      chooseOrganization(organizations, undefined, "old-account-org", silent)
    ).rejects.toThrow("inth switch");
    await expect(
      chooseOrganization(organizations, undefined, undefined, silent)
    ).rejects.toThrow("--organization");
  });
  it("allows cancellation without making a selection", async () => {
    await expect(
      chooseOrganization(organizations, undefined, undefined, {
        interactive: true,
        select: () => Promise.reject(new Error("Cancelled")),
      })
    ).rejects.toThrow("Cancelled");
  });
});

it("bounds organization pagination even when every cursor is new", async () => {
  let pages = 0;
  await expect(
    collectOrganizations(() => {
      pages += 1;
      return Promise.resolve({
        data: [],
        pagination: { hasMore: true, nextCursor: `cursor-${pages}` },
        success: true,
      });
    })
  ).rejects.toMatchObject({ code: "invalid_response" });
  expect(pages).toBe(100);
});
