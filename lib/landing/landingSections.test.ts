import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MENU_SECTIONS } from "@/components/landing/site-header";

/**
 * The header menu jumps to sections of `app/page.tsx` by id. A section renamed
 * or removed there without the menu following is a dead link on the front
 * page, and nothing else would notice.
 */
const page = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");

describe("landing menu", () => {
  it.each(MENU_SECTIONS.map((s) => [s.id]))("jumps to a section that exists: #%s", (id) => {
    expect(page).toContain(`id="${id}"`);
  });

  it("the docked widget watches the hero by the id the page gives it", () => {
    expect(page).toContain('id="hero"');
  });
});
