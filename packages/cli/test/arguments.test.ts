import { describe, expect, it } from "vitest";

import { parseArguments } from "../src/arguments.ts";

describe("native CLI arguments", () => {
  it.each(["login", "signup"])(
    "starts %s with an email through resumable approval",
    (command) => {
      const result = parseArguments([
        command,
        "--email",
        "person@example.com",
        "--scopes",
        "organizations.read,organizations.write",
        "--json",
      ]);
      expect(result).toMatchObject({
        argument: "start",
        authMode: "agent",
        command: "auth",
        json: true,
      });
      expect(result.values).toContainEqual({
        name: "email",
        value: "person@example.com",
      });
      expect(result.values).toContainEqual({
        name: "scopes",
        value: "organizations.read,organizations.write",
      });
    }
  );
  it("resumes approval without starting another login", () => {
    expect(parseArguments(["login", "--complete", "--json"])).toMatchObject({
      argument: "complete",
      authMode: "agent",
      command: "auth",
      values: [],
    });
    expect(() =>
      parseArguments(["login", "--complete", "--email", "person@example.com"])
    ).toThrow("without email");
    expect(() =>
      parseArguments([
        "login",
        "--email",
        "person@example.com",
        "--auth",
        "browser",
      ])
    ).toThrow();
    expect(() => parseArguments(["signup", "--json"])).toThrow(
      "inth signup --email"
    );
    expect(parseArguments(["login", "--help"]).command).toBe("login");
    expect(parseArguments(["login"]).command).toBe("login");
    expect(() =>
      parseArguments(["auth", "start", "--email", "person@example.com"])
    ).toThrow("--yes");
  });
  it("accepts whoami with machine output and rejects positional arguments", () => {
    expect(
      parseArguments(["whoami", "--json", "--token", "inth_test"])
    ).toMatchObject({ command: "whoami", json: true, token: "inth_test" });
    expect(() => parseArguments(["whoami", "extra"])).toThrow(
      "Usage: inth whoami"
    );
  });
  it("accepts organization commands and requires explicit creation fields", () => {
    expect(
      parseArguments([
        "org",
        "create",
        "--name",
        "Acme Team",
        "--slug=acme",
        "--json",
      ])
    ).toMatchObject({
      argument: "create",
      command: "org",
      json: true,
      name: "Acme Team",
      slug: "acme",
    });
    expect(parseArguments(["org", "list"])).toMatchObject({ argument: "list" });
    for (const args of [
      ["org"],
      ["org", "delete"],
      ["org", "create"],
      ["org", "create", "--name", "Acme"],
      ["org", "create", "--name", " ", "--slug", "acme"],
      ["org", "list", "--name", "Acme"],
      ["org", "list", "--organization", "org-one"],
      ["login", "--slug", "acme"],
      ["org", "create", "--name", "Acme", "--slug", "acme", "--slug", "again"],
    ]) {
      expect(() => parseArguments(args)).toThrow();
    }
  });
  it("accepts API options before or after the command", () => {
    expect(
      parseArguments([
        "--token",
        "inth_fake",
        "api",
        "/v1/me",
        "--organization=org-one",
      ])
    ).toMatchObject({
      argument: "/v1/me",
      command: "api",
      organization: "org-one",
      token: "inth_fake",
    });
    expect(
      parseArguments(["login", "--no-browser", "--organization", "org-one"])
    ).toMatchObject({ noBrowser: true, organization: "org-one" });
  });
  it("rejects missing or repeated option values without printing tokens", () => {
    expect(() => parseArguments(["login", "--token"])).toThrow(
      "Provide a value"
    );
    expect(() =>
      parseArguments(["login", "--token", "--organization", "org-one"])
    ).toThrow("Provide a value");
    expect(() =>
      parseArguments(["login", "--token", "inth_one", "--token", "inth_two"])
    ).toThrow("Use --token only once");
    expect(() => parseArguments(["login", "--bad=secret"])).toThrow(
      'Unknown option "--bad". Run inth --help for available options.'
    );
  });
  it("offers a correction for misplaced auth subcommands", () => {
    expect(() => parseArguments(["status"])).toThrow("inth auth status");
    expect(() => parseArguments(["auth"])).toThrow(
      "<start|complete|retry|status|refresh|organizations>"
    );
    expect(() => parseArguments(["logout", "extra"])).toThrow(
      "Usage: inth logout"
    );
  });
});
