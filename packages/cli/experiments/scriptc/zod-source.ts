import {
  object,
  string,
  number,
} from "./inrepo_modules/zod/src/v4/classic/schemas.ts";

// Compile the real kind of validation used for OAuth responses, with source imports.
const token = object({
  access_token: string().min(1),
  expires_in: number().positive(),
  refresh_token: string().min(1),
});
const parsed = token.parse({
  access_token: "test",
  expires_in: 900,
  refresh_token: "test",
});
console.log(parsed.expires_in);
