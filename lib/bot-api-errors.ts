import { randomUUID } from "node:crypto";
import { z } from "zod";

type Service = "role-links" | "submission-routes" | "management" | "availability" | "tickets" | "socials";
const names: Record<Service, string> = { "role-links": "Discord role links", "submission-routes": "submission routing", management: "workspace permission settings", availability: "availability", tickets: "ticket settings and drafts", socials: "public Socials settings" };
const actions = new Set(["read", "save", "profile", "overview", "teams", "save-profile", "save-teams"]);
const schemaCodes = new Set(["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"]);
const permissionCodes = new Set(["ER_ACCESS_DENIED_ERROR", "ER_DBACCESS_DENIED_ERROR", "ER_TABLEACCESS_DENIED_ERROR", "ER_COLUMNACCESS_DENIED_ERROR", "ER_SPECIFIC_ACCESS_DENIED_ERROR", "ER_TRG_NO_DEFINER"]);
const connectionCodes = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ER_CON_COUNT_ERROR", "ER_TOO_MANY_USER_CONNECTIONS"]);
const queryCodes = new Set(["ER_PARSE_ERROR", "ER_OPERAND_COLUMNS", "ER_CANT_AGGREGATE_2COLLATIONS", "ER_CANT_AGGREGATE_3COLLATIONS", "ER_CANT_AGGREGATE_NCOLLATIONS"]);

export function botRequestId(request: Request) {
  const incoming = request.headers.get("X-Xenon-Request-Id");
  return incoming && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(incoming) ? incoming : randomUUID();
}

// The bot receives fixed diagnostic codes, never driver errors, SQL or saved data.
export function botStorageFailure(error: unknown, service: Service, action: string, request: Request) {
  const rawCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const databaseCode = typeof rawCode === "string" ? rawCode : "";
  let code = "BOT_STORAGE_UNAVAILABLE", message = `The website could not access ${names[service]}. Check the website log using this request reference.`;
  if (schemaCodes.has(databaseCode)) {
    code = "BOT_SCHEMA_MISMATCH"; message = `The website database schema for ${names[service]} is incomplete. The operator should check the website migrations.`;
  } else if (permissionCodes.has(databaseCode)) {
    code = "BOT_DATABASE_PERMISSIONS"; message = `The website database user cannot access ${names[service]}. The operator should check database permissions in Hostinger.`;
  } else if (connectionCodes.has(databaseCode)) {
    code = "BOT_DATABASE_CONNECTION"; message = "The website cannot connect to its database. The operator should check the Hostinger database connection.";
  } else if (queryCodes.has(databaseCode)) {
    code = "BOT_DATABASE_QUERY"; message = `A website database query for ${names[service]} failed. The operator should check the website log.`;
  } else if (error instanceof z.ZodError || error instanceof SyntaxError) {
    code = "BOT_SAVED_DATA_INVALID"; message = `Saved ${names[service]} data could not be read. The operator should check the website log before changing records.`;
  }
  const requestId = botRequestId(request);
  const known = [schemaCodes, permissionCodes, connectionCodes, queryCodes].some((codes) => codes.has(databaseCode));
  return { body: { error: message, code, requestId }, diagnostic: { event: "bot_storage_failed", requestId, service, action: actions.has(action) ? action : "unknown", code, ...(known ? { databaseCode } : {}) } };
}
