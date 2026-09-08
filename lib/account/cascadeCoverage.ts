import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ⚠️ EVERY FOREIGN KEY TO `profiles` OR `auth.users` MUST CASCADE, AND THIS IS
 * WHAT NOTICES WHEN ONE STOPS.
 *
 * ## The thing it guards
 *
 * `16-account-deletion.md` deletes an account by deleting ONE row - the auth
 * user - and letting the database cascade the rest. That is only a complete
 * erasure while every user-scoped table actually cascades, and **it is complete
 * by CONVENTION**: nothing in Postgres forces a new table to declare
 * `ON DELETE CASCADE`, and a table added without one would simply survive the
 * deletion. Silently. Nobody would be told, and the person who deleted their
 * account would be told it was complete.
 *
 * So this enumerates them from the repository's own SQL and fails the build if
 * any one of them does not cascade.
 *
 * ## ⚠️ IT REFUSES TO PASS ON AN EMPTY ENUMERATION
 *
 * The failure mode of every instrument like this is finding nothing and
 * reporting success: a parser that stops matching answers "zero non-cascading
 * foreign keys" and looks identical to a clean tree. So {@link FLOOR} is
 * asserted separately. A regex change that breaks the scan turns the build red
 * instead of turning the guard off.
 *
 * ## What it does NOT see, stated rather than implied
 *
 * It reads the REPOSITORY. A table created out of band - straight through the
 * SQL editor or the MCP, as `supabase/legal/013` records happening - has no file
 * here and cannot be seen. The production `pg_constraint` read on 2026-09-08
 * covering all 41 constraints is the complement to this, and that one is a
 * point-in-time measurement rather than a standing check.
 */

/** Where the schema lives. */
const SQL_ROOT = "supabase";

/**
 * ⚠️ THE ENUMERATED-NOTHING GUARD. 34 references were found on 2026-09-08, all
 * cascading. A floor rather than an exact count, so legitimately removing a
 * table does not fail the build - but a parser that stops working does.
 */
export const FLOOR = 30;

export interface ForeignKeyRef {
  file: string;
  target: string;
  cascades: boolean;
  text: string;
}

function sqlFilesIn(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sqlFilesIn(path));
    // ⚠️ The gitignored `* 2.sql` twins on disk are duplicates of real
    // migrations. Counting them would inflate the floor and let a genuine
    // regression hide behind a copy of a healthy file.
    else if (path.endsWith(".sql") && !/ \d+\.sql$/.test(path)) out.push(path);
  }
  return out;
}

/** Strip comments, so commented-out DDL is not mistaken for schema. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const REFERENCE =
  /references\s+(public\.profiles|profiles|auth\.users)\s*\(\s*\w+\s*\)([^,]{0,80})/gi;

/** Every foreign key in the repo's SQL that points at a cascade root. */
export function foreignKeysToCascadeRoots(root = SQL_ROOT): ForeignKeyRef[] {
  const found: ForeignKeyRef[] = [];

  for (const file of sqlFilesIn(root)) {
    const sql = stripComments(readFileSync(file, "utf8")).replace(/\s+/g, " ");
    for (const match of sql.matchAll(REFERENCE)) {
      const [whole, target, trailing] = match;
      found.push({
        file,
        target: target.toLowerCase(),
        // `ON DELETE CASCADE` binds to the reference and must appear before the
        // column definition ends, which is what the comma-free capture enforces.
        cascades: /on\s+delete\s+cascade/i.test(trailing),
        text: whole.trim().slice(0, 90),
      });
    }
  }
  return found;
}
