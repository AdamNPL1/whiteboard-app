import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve("supabase");
const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
const errors = [];
const contents = new Map(files.map((name) => [name, readFileSync(resolve(directory, name), "utf8")]));

for (const [name, sql] of contents) {
  const normalized = sql.toLowerCase();
  if (!normalized.trim()) errors.push(`${name}: file is empty`);
  if (/\bdisable\s+row\s+level\s+security\b/.test(normalized)) errors.push(`${name}: disables row-level security`);
  if (/\b(sb_secret_|service_role_key\s*=|eyj[a-z0-9_-]{20,})/i.test(sql)) errors.push(`${name}: appears to contain a secret`);

  const definerFunctions = normalized.split(/create\s+or\s+replace\s+function/).slice(1);
  for (const definition of definerFunctions) {
    const header = definition.slice(0, definition.indexOf("as $$") >= 0 ? definition.indexOf("as $$") : 2_000);
    if (header.includes("security definer") && !header.includes("set search_path")) {
      errors.push(`${name}: SECURITY DEFINER function is missing an explicit search_path`);
    }
  }
}

const createdTables = [...contents.values()].flatMap((sql) =>
  [...sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.([a-z0-9_]+)/gi)].map((match) => match[1])
);
const hardening = contents.get("security-hardening.sql")?.toLowerCase() ?? "";
const audit = contents.get("security-audit.sql")?.toLowerCase() ?? "";
for (const table of new Set(createdTables)) {
  if (!hardening.includes(`'${table}'`)) errors.push(`security-hardening.sql: missing ${table}`);
  if (!audit.includes(`'${table}'`)) errors.push(`security-audit.sql: missing ${table}`);
}

if (errors.length) {
  console.error(`Supabase SQL validation failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Validated ${files.length} SQL files and ${new Set(createdTables).size} application tables.`);
