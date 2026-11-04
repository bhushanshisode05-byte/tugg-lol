import { authReference, type AuthDiagnostic } from "./auth-diagnostics";
import { TURNSTILE_ACTIONS } from "./turnstile";

const cloudflareCodes = new Set(["missing-input-secret", "invalid-input-secret", "missing-input-response", "invalid-input-response", "bad-request", "timeout-or-duplicate", "internal-error", "hostname-mismatch"]);
const actions = Object.values(TURNSTILE_ACTIONS);
/** Construct a new record; never serialize an exception, request or provider payload. */
export async function logAuthDiagnostic(input: AuthDiagnostic) {
  const detail = {
    reason: authReference(input.reason) ?? "unexpected_error",
    operation: actions.find(action => action === input.operation) ?? "email_auth",
    errorCodes: (input.errorCodes ?? []).slice(0, 10).map(code => cloudflareCodes.has(code) ? code : "unknown"),
    hostname: typeof input.hostname === "string" && input.hostname.length <= 253 && /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i.test(input.hostname) ? input.hostname : null,
    action: actions.find(action => action === input.action) ?? (input.action ? "unrecognized" : null),
    expectedAction: actions.find(action => action === input.expectedAction) ?? null,
  };
  console.error("auth_diagnostic", detail);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.from("events").insert({ kind: "auth_diagnostic", detail });
    if (result.error) console.error("auth_diagnostic_storage_unavailable");
  } catch { console.error("auth_diagnostic_storage_unavailable"); }
}