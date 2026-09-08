import { CAPABILITIES } from "../../src/auth-types.ts";
import type { MeResponse } from "../../src/identity.ts";

export const userIdentity: MeResponse = {
  data: {
    activeOrganizationId: null,
    organizations: [
      {
        id: "org-one",
        name: "One",
        role: "owner",
        slug: "one",
      },
    ],
    principal: { type: "oauth", userId: "user-one" },
    scopes: CAPABILITIES,
  },
  success: true,
};
export const keyIdentity: MeResponse = {
  data: {
    activeOrganizationId: "org-one",
    organizations: [],
    principal: {
      createdBy: "user-creator",
      keyId: "key-one",
      organizationId: "org-one",
      type: "api_key",
    },
    scopes: [
      "organizations.read",
      "projects.read",
      "projects.write",
      "api-keys.read",
      "inbox.read",
      "billing.read",
    ],
  },
  success: true,
};

export const layoutIdentity: MeResponse = {
  data: {
    activeOrganizationId: null,
    organizations: [
      {
        id: "org-one",
        name: "Inth",
        role: "owner",
        slug: "inth",
      },
      {
        id: "org-two",
        name: "Inth",
        role: "member",
        slug: "inth-old",
      },
      {
        id: "org-three",
        name: "Primitive",
        role: "owner",
        slug: "primitive",
      },
      {
        id: "org-four",
        name: "Documentation team",
        role: "admin",
        slug: "documentation-team",
      },
    ],
    principal: { type: "oauth", userId: "user-fixture-abcd" },
    scopes: CAPABILITIES,
  },
  success: true,
};
