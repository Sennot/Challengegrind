// Run SQL against the Supabase database (dev tool, never bundled into the site).
//   node scripts/db.mjs supabase/migrations/0004_x.sql   — run a file
//   node scripts/db.mjs -e "select 1"                    — run inline SQL
// Reads VITE_SUPABASE_URL and SUPABASE_DB_PASSWORD from .env.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

const ref = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
const password = env.SUPABASE_DB_PASSWORD;
if (!password) throw new Error("SUPABASE_DB_PASSWORD missing in .env");

// Direct db.<ref>.supabase.co is IPv6-only; use the session pooler (IPv4)
const host = process.env.DB_HOST || env.SUPABASE_DB_HOST || "aws-1-eu-west-3.pooler.supabase.com";
const user = `postgres.${ref}`;
const sql = postgres({ host, port: Number(process.env.DB_PORT || 5432), database: "postgres", username: user, password, ssl: "require", max: 1, onnotice: () => {} });

const [flag, arg] = process.argv.slice(2);
const text = flag === "-e" ? arg : readFileSync(flag, "utf8");

try {
  const result = await sql.unsafe(text);
  const rows = Array.isArray(result) ? result : [];
  console.log(rows.length ? JSON.stringify(rows, null, 2) : "OK");
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
