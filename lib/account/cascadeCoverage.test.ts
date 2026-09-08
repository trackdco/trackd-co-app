/**
 * ⚠️ THE STANDING GUARD ON THE CASCADE, AND THE PROOF THAT IT CAN GO RED.
 *
 * Deleting an account deletes ONE row and trusts the database to cascade the
 * rest. That is true today and true only by convention. This is what turns the
 * build red the day it stops being true.
 *
 * The second block is the important one: it runs the SAME scanner over a fixture
 * whose foreign key has been mutated to `ON DELETE NO ACTION` and asserts it is
 * caught. A guard nobody has watched fail is a guard nobody should trust.
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { foreignKeysToCascadeRoots, FLOOR } from "./cascadeCoverage";

describe("every foreign key to a cascade root cascades", () => {
  const found = foreignKeysToCascadeRoots();

  it("⚠️ found enough to have actually looked", () => {
    // The enumerated-nothing guard. A broken regex reports a clean tree
    // otherwise, which is the instrument failure this project keeps meeting.
    expect(found.length).toBeGreaterThanOrEqual(FLOOR);
  });

  it("every one of them declares ON DELETE CASCADE", () => {
    const offenders = found
      .filter((f) => !f.cascades)
      .map((f) => `${f.file}: ${f.text}`);
    expect(offenders).toEqual([]);
  });

  it("both cascade roots are represented", () => {
    const targets = new Set(found.map((f) => f.target.replace("public.", "")));
    expect(targets.has("profiles")).toBe(true);
    expect(targets.has("auth.users")).toBe(true);
  });
});

describe("⚠️ PROOF IT CAN FAIL — a non-cascading key is caught", () => {
  /** Runs the real scanner over a scratch tree, not over the repo. */
  function scan(sql: string) {
    const dir = mkdtempSync(join(tmpdir(), "cascade-"));
    try {
      writeFileSync(join(dir, "mutant.sql"), sql);
      return foreignKeysToCascadeRoots(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("catches ON DELETE NO ACTION", () => {
    const found = scan(
      `create table x (user_id uuid not null references public.profiles (id) on delete no action);`,
    );
    expect(found).toHaveLength(1);
    expect(found[0].cascades).toBe(false);
  });

  it("catches a foreign key with no ON DELETE clause at all", () => {
    const found = scan(
      `create table x (user_id uuid not null references profiles(id), name text);`,
    );
    expect(found).toHaveLength(1);
    expect(found[0].cascades).toBe(false);
  });

  it("catches one on auth.users too, not just profiles", () => {
    const found = scan(`create table x (user_id uuid references auth.users(id) on delete set null);`);
    expect(found).toHaveLength(1);
    expect(found[0].cascades).toBe(false);
  });

  it("catches a table-level constraint, not only a column-level one", () => {
    const found = scan(
      `create table x (user_id uuid, constraint fk foreign key (user_id) references profiles(id));`,
    );
    expect(found).toHaveLength(1);
    expect(found[0].cascades).toBe(false);
  });

  it("still PASSES a healthy one, so it is not just always red", () => {
    const found = scan(
      `create table x (user_id uuid not null references public.profiles (id) on delete cascade);`,
    );
    expect(found).toHaveLength(1);
    expect(found[0].cascades).toBe(true);
  });

  it("does not count a commented-out foreign key", () => {
    const found = scan(`-- user_id uuid references profiles(id) on delete no action\nselect 1;`);
    expect(found).toEqual([]);
  });
});
