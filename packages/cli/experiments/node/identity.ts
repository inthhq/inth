import { z } from "zod";

export const userInfoSchema = z.object({
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  sub: z.string().min(1),
});

// Matches the public OpenAPI Me schema, including optional principal fields.
export const meSchema = z.object({
  data: z.object({
    activeOrganizationId: z.string().nullable(),
    organizations: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        role: z.string(),
        slug: z.string(),
      })
    ),
    principal: z.object({
      activeOrganizationId: z.string().nullable().optional(),
      createdBy: z.string().optional(),
      keyId: z.string().optional(),
      organizationId: z.string().optional(),
      type: z.string().min(1),
      userId: z.string().optional(),
    }),
    scopes: z.array(z.string()),
  }),
  success: z.literal(true),
});
