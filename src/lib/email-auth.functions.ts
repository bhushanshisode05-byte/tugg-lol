import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { emailAuthSchema, resetPasswordSchema } from "./email-auth-schema";
import { executeEmailAuth, executePasswordReset } from "./email-auth.server";

export const emailSignIn = createServerFn({ method: "POST" })
  .inputValidator(emailAuthSchema)
  .handler(({ data }) => executeEmailAuth(data, getRequest()));

export const resetOwnerPassword = createServerFn({ method: "POST" })
  .inputValidator(resetPasswordSchema)
  .handler(({ data }) => executePasswordReset(data, getRequest()));