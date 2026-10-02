// Attack-style permission tests against the real database.
// Everything runs inside ONE transaction that is always rolled back — no data changes persist.
//   node scripts/security-test.mjs
// Needs two existing accounts: the owner and one other ("victim") account. Ids are looked up by role.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
const sql = postgres({
  host: env.SUPABASE_DB_HOST || "aws-1-eu-west-3.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  username: `postgres.${ref}`,
  password: env.SUPABASE_DB_PASSWORD,
  ssl: "require",
  max: 1,
  onnotice: () => {},
});

const results = [];
class Rollback extends Error {}

try {
  await sql.begin(async (tx) => {
    const [owner] = await tx`select id from public.profiles where role = 'owner' limit 1`;
    const [user] = await tx`select id from public.profiles where role <> 'owner' limit 1`;
    const [level] = await tx`select id from public.levels order by position limit 1`;
    if (!owner || !user || !level) throw new Error("need an owner, one other account and one level");
    const O = owner.id, U = user.id, L = level.id;

    // Fresh state for the test user (rolled back at the end)
    await tx`delete from public.records where player_id = ${U}`;

    /** Run `query` as a given identity inside a savepoint. expect: "deny" (error or 0 rows) | "allow" */
    async function check(name, as, query, expect, setup) {
      let outcome, detail;
      try {
        await tx.savepoint(async (sp) => {
          if (setup) await sp.unsafe(setup);
          if (as === "postgres") {
            // no role switch: simulates the auth server / service writing to auth.users
          } else if (as === "anon") {
            await sp.unsafe(`set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
          } else {
            const uid = as === "owner" ? O : U;
            await sp.unsafe(`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true)`);
          }
          const res = await sp.unsafe(query.replaceAll(":O", `'${O}'`).replaceAll(":U", `'${U}'`).replaceAll(":L", String(L)));
          const n = res.count ?? res.length;
          outcome = n === 0 && /^\s*(update|delete|select \* from)/i.test(query) ? "deny" : "allow";
          detail = `${n} row(s)`;
          throw new Rollback();
        });
      } catch (e) {
        if (!(e instanceof Rollback)) {
          outcome = "deny";
          detail = e.message.slice(0, 90);
        }
      }
      results.push({ ok: outcome === expect ? "PASS" : "FAIL", name, expect, got: outcome, detail });
    }

    const asPlayer = `update public.profiles set role='player', banned=false where id=:U`.replaceAll(":U", `'${U}'`);
    const asRole = (r, banned = false) => `update public.profiles set role='${r}', banned=${banned} where id='${U}'`;

    // ---- anonymous visitor
    await check("anon: insert record", "anon", `insert into public.records (level_id, video_url) values (:L, 'https://youtu.be/x')`, "deny");
    await check("anon: edit profile", "anon", `update public.profiles set bio='x'`, "deny");
    await check("anon: add_level", "anon", `select public.add_level('x','x','x',null,null,1)`, "deny");
    await check("anon: review_record", "anon", `select public.review_record(1, true, null)`, "deny");
    await check("anon: set_rules", "anon", `select public.set_rules('[]'::jsonb)`, "deny");
    await check("anon: write site_settings", "anon", `insert into public.site_settings (key, value) values ('rules','[]')`, "deny");
    await check("anon: write changelog", "anon", `insert into public.changelog (kind, level_name) values ('added','x')`, "deny");
    await check("anon: read non-approved records", "anon", `select * from public.records where status <> 'approved'`, "deny",
      `insert into public.records (level_id, player_id, video_url) values (${L}, '${U}', 'https://youtu.be/pending1')`);
    await check("anon: read auth.users", "anon", `select * from auth.users`, "deny");

    // ---- regular player
    await check("player: make self owner", "user", `update public.profiles set role='owner' where id=:U`, "deny", asPlayer);
    await check("player: unban self", "user", `update public.profiles set banned=false where id=:U`, "deny", asPlayer);
    await check("player: rename self", "user", `update public.profiles set username='magnusOpux2' where id=:U`, "deny", asPlayer);
    await check("player: edit other's profile", "user", `update public.profiles set bio='pwned' where id=:O`, "deny", asPlayer);
    await check("player: edit own bio", "user", `update public.profiles set bio='hi' where id=:U`, "allow", asPlayer);
    await check("player: insert record as other user", "user", `insert into public.records (level_id, player_id, video_url) values (:L, :O, 'https://youtu.be/x')`, "deny", asPlayer);
    await check("player: insert pre-approved record", "user", `insert into public.records (level_id, video_url, status) values (:L, 'https://youtu.be/x', 'approved')`, "deny", asPlayer);
    await check("player: insert normal record", "user", `insert into public.records (level_id, video_url) values (:L, 'https://youtu.be/dQw4w9WgXcQ')`, "allow", asPlayer);
    await check("player: javascript: video url", "user", `insert into public.records (level_id, video_url) values (:L, 'javascript:alert(1)')`, "deny", asPlayer);
    await check("player: approve own record (update)", "user", `update public.records set status='approved' where player_id=:U`, "deny",
      asPlayer + `; insert into public.records (level_id, player_id, video_url) values (${L}, '${U}', 'https://youtu.be/own')`);
    await check("player: review_record", "user", `select public.review_record((select max(id) from public.records), true, null)`, "deny", asPlayer);
    await check("player: delete others' records", "user", `delete from public.records where player_id <> :U`, "deny", asPlayer);
    await check("player: add_level", "user", `select public.add_level('x','x','x',null,null,1)`, "deny", asPlayer);
    await check("player: move_level", "user", `select public.move_level(:L, 1)`, "deny", asPlayer);
    await check("player: remove_level", "user", `select public.remove_level(:L)`, "deny", asPlayer);
    await check("player: edit level", "user", `update public.levels set name='hacked'`, "deny", asPlayer);
    await check("player: set_user_role self→owner", "user", `select public.set_user_role(:U, 'owner')`, "deny", asPlayer);
    await check("player: ban owner", "user", `select public.set_user_ban(:O, true, 'x')`, "deny", asPlayer);
    await check("player: set_rules", "user", `select public.set_rules('[]'::jsonb)`, "deny", asPlayer);
    await check("player: require_rank direct", "user", `select public.require_rank(0)`, "deny", asPlayer);
    await check("player: write auth.users", "user", `update auth.users set email='x@y.z' where id=:U`, "deny", asPlayer);

    // ---- banned player
    await check("banned: insert record", "user", `insert into public.records (level_id, video_url) values (:L, 'https://youtu.be/x')`, "deny", asRole("player", true));
    await check("banned: edit own profile", "user", `update public.profiles set bio='x' where id=:U`, "deny", asRole("player", true));

    // ---- staff
    await check("helper: review_record", "user", `select public.review_record((select max(id) from public.records), false, 'test')`, "allow",
      asRole("helper") + `; insert into public.records (level_id, player_id, video_url) values (${L}, '${O}', 'https://youtu.be/h')`);
    await check("helper: reject without reason", "user", `select public.review_record((select max(id) from public.records), false, '  ')`, "deny",
      asRole("helper") + `; insert into public.records (level_id, player_id, video_url) values (${L}, '${O}', 'https://youtu.be/h2')`);
    await check("helper: add_level", "user", `select public.add_level('x','x','x',null,null,1)`, "deny", asRole("helper"));
    await check("moderator: add_level", "user", `select public.add_level('x','x','x',null,null,1)`, "allow", asRole("moderator"));
    await check("moderator: set_user_role", "user", `select public.set_user_role(:O, 'player')`, "deny", asRole("moderator"));
    await check("moderator: set_rules", "user", `select public.set_rules('[]'::jsonb)`, "deny", asRole("moderator"));
    await check("admin: demote owner", "user", `select public.set_user_role(:O, 'player')`, "deny", asRole("admin"));
    await check("admin: ban owner", "user", `select public.set_user_ban(:O, true, 'x')`, "deny", asRole("admin"));
    await check("admin: set_rules", "user", `select public.set_rules('[{"title":"t","items":["a"]}]'::jsonb)`, "allow", asRole("admin"));
    await check("admin: malformed rules", "user", `select public.set_rules('{"evil":1}'::jsonb)`, "deny", asRole("admin"));
    await check("owner: grant admin to self(no-op guard)", "owner", `select public.set_user_role(:O, 'admin')`, "deny");

    // ---- banned staff must lose powers
    await check("banned helper: review_record", "user", `select public.review_record((select max(id) from public.records), true, null)`, "deny",
      asRole("helper", true) + `; insert into public.records (level_id, player_id, video_url) values (${L}, '${O}', 'https://youtu.be/b')`);
    await check("banned moderator: add_level", "user", `select public.add_level('x','x','x',null,null,1)`, "deny", asRole("moderator", true));
    await check("admin: promote banned user", "owner", `select public.set_user_role(:U, 'moderator')`, "deny", asRole("player", true));

    // ---- account identity & links
    await check("signup: email ≠ username (squat)", "postgres",
      `insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'kunakov@users.challengegrind.local', '{"username":"Attacker"}')`, "deny");
    await check("signup: canonical email", "postgres",
      `insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'kunakov@users.challengegrind.local', '{"username":"Kunakov"}')`, "allow");
    await check("auth: change email (hijack login)", "postgres", `update auth.users set email='kunakov@users.challengegrind.local' where id=:U`, "deny");
    await check("auth: request email change", "postgres", `update auth.users set email_change='kunakov@users.challengegrind.local' where id=:U`, "deny");
    await check("auth: normal login update", "postgres", `update auth.users set last_sign_in_at=now() where id=:U`, "allow");
    await check("player: non-YouTube/Telegram video", "user", `insert into public.records (level_id, video_url) values (:L, 'https://evil.example/phish')`, "deny", asPlayer);
    await check("player: telegram video", "user", `insert into public.records (level_id, video_url) values (:L, 'https://t.me/somechannel/12')`, "allow", asPlayer);
    await check("player: admin_revoke_sessions", "user", `select public.admin_revoke_sessions(:O)`, "deny", asPlayer);

    throw new Rollback();
  });
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
} finally {
  await sql.end();
}

const fails = results.filter((r) => r.ok === "FAIL");
for (const r of results) console.log(`${r.ok}  ${r.name.padEnd(42)} expect=${r.expect.padEnd(5)} got=${r.got.padEnd(5)} ${r.detail}`);
console.log(`\n${results.length - fails.length}/${results.length} passed — all changes rolled back`);
process.exitCode = fails.length ? 1 : 0;
