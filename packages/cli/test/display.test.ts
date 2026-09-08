import { afterEach, describe, expect, it, vi } from "vitest";

import { colorEnabled, textWidth } from "../src/display.ts";
import { identitySummary } from "../src/identity.ts";
import { userIdentity } from "./fixtures/identity.ts";

afterEach(() => vi.unstubAllEnvs());

describe("human identity output", () => {
  it.each([
    {
      email: "kaylee@example.com",
      expected: "Kaylee <kaylee@example.com>",
      name: "Kaylee",
    },
    { email: "kaylee@example.com", expected: "kaylee@example.com", name: null },
    { email: null, expected: "Kaylee", name: "Kaylee" },
    { email: "", expected: "User …-one", name: "" },
  ])(
    "displays available name and email with an ID fallback",
    ({ name, email, expected }) => {
      const output = identitySummary(userIdentity.data, {
        color: false,
        columns: 80,
        profile: { email, name, sub: "user-one" },
      });
      expect(output).toContain(expected);
    }
  );
  it("uses names and full slugs and marks the selected organization without exposing full IDs", () => {
    const output = identitySummary(userIdentity.data, {
      color: false,
      columns: 80,
      selectedOrganization: "org-one",
    });
    expect(output).not.toContain("Selected:");
    expect(output).toContain("Browser login");
    expect(output).toContain("Capabilities: organizations.read");
    expect(output).toContain("Organizations (1)");
    expect(output).toContain("● One");
    expect(output).not.toContain("org-one");
    expect(output).not.toContain("user-one");
    expect(output).not.toContain("API active: none");
  });

  it("keeps duplicate organization names distinguishable by slug", () => {
    const output = identitySummary(
      {
        ...userIdentity.data,
        organizations: [
          {
            id: "org-a",
            name: "Inth",
            role: "owner",
            slug: "inth",
          },
          {
            id: "org-b",
            name: "Inth",
            role: "member",
            slug: "inth-old",
          },
        ],
      },
      { color: false, columns: 80, selectedOrganization: "inth-old" }
    );
    expect(output).not.toContain("Selected:");
    expect(output).toMatch(/● Inth \(inth-old\)\s+member/u);
    expect(output).toMatch(/ {2}Inth \(inth\)\s+owner/u);
  });

  it("wraps long Unicode names and slugs in narrow terminals without dropping text", () => {
    const name = "東京開発チーム🌱".repeat(4);
    const slug = "a-very-long-organization-slug-that-must-stay-readable";
    const output = identitySummary(
      {
        ...userIdentity.data,
        organizations: [
          {
            id: "org-long",
            name,
            role: "owner",
            slug,
          },
        ],
      },
      { color: false, columns: 28 }
    );
    for (const line of output.split("\n")) {
      expect(textWidth(line)).toBeLessThan(28);
    }
    const joined = output.replaceAll(/\s/gu, "");
    expect(joined).toContain(name);
    expect(joined).toContain(slug);
    expect(output).not.toContain("�");
  });

  it("does not present a stale local selection as an available organization", () => {
    const output = identitySummary(userIdentity.data, {
      color: false,
      columns: 80,
      selectedOrganization: "org-missing",
    });
    expect(output).toContain(
      "Selected organization is unavailable. Run inth switch."
    );
    expect(output).not.toContain("●");
  });

  it("distinguishes API state from the CLI selection using readable labels", () => {
    const output = identitySummary({
      ...userIdentity.data,
      activeOrganizationId: "org-one",
    });
    expect(output).toContain("No organization selected.");
    expect(output).toContain("API active: One (one)");
  });

  it("adds trusted colour codes but strips controls from API labels", () => {
    const output = identitySummary(
      {
        ...userIdentity.data,
        organizations: [
          {
            id: "org-one",
            name: "One\u001B[2J\n",
            role: "owner\u0007",
            slug: "one\t",
          },
        ],
      },
      { color: true, columns: 80, selectedOrganization: "org-one" }
    );
    expect(output).toContain("\u001B[1;32mSigned in\u001B[0m");
    expect(output).toContain("\u001B[1;36mOne");
    expect(output).not.toContain("\u001B[2J");
    expect(output).not.toContain("\u0007");
    expect(output).not.toContain("\t");
  });
});

describe("terminal colour policy", () => {
  it("only enables colour on a capable terminal", () => {
    // eslint-disable-next-line unicorn/no-useless-undefined -- Vitest requires the second argument to remove an environment variable.
    vi.stubEnv("NO_COLOR", undefined);
    vi.stubEnv("TERM", "xterm-256color");
    expect(colorEnabled(true)).toBe(true);
    expect(colorEnabled(false)).toBe(false);
    vi.stubEnv("TERM", "dumb");
    expect(colorEnabled(true)).toBe(false);
  });

  it.each(["1", "0", "true"])("respects NO_COLOR=%s", (value) => {
    vi.stubEnv("NO_COLOR", value);
    vi.stubEnv("TERM", "xterm-256color");
    expect(colorEnabled(true)).toBe(false);
  });
});

it("ignores an empty NO_COLOR", () => {
  vi.stubEnv("NO_COLOR", "");
  vi.stubEnv("TERM", "xterm-256color");
  expect(colorEnabled(true)).toBe(true);
});
