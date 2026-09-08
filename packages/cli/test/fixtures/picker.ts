import { chooseOrganization } from "../../src/organizations.ts";
import type { Organization, OrganizationUI } from "../../src/organizations.ts";
import { reportError } from "../../src/output.ts";

export const exercisePicker = async (
  ui: OrganizationUI,
  signal: AbortSignal
): Promise<void> => {
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
  if (process.env.INTH_TEST_LONG_LIST === "1") {
    for (let index = 3; index <= 12; index += 1) {
      organizations.push({
        id: `org-${index}`,
        name: `Organization ${index} 東京 ${"long label ".repeat(20)}`,
        role: "member",
        slug: `slug-${index}`,
      });
    }
  }
  try {
    const selected = await chooseOrganization(
      organizations,
      undefined,
      undefined,
      ui
    );
    console.log(`Selected: ${selected}`);
    process.exit(0);
  } catch (error) {
    process.exit(
      reportError(
        false,
        error instanceof Error ? error : new Error("Selection failed."),
        signal.aborted
      )
    );
  }
};
