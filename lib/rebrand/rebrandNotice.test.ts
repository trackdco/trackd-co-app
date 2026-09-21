import { describe, expect, it } from "vitest";

import {
  REBRAND_NOTICE_COOKIE,
  RENAME_SHIPPED_AT,
  rebrandNoticeSeen,
  shouldShowRebrandNotice,
} from "./rebrandNotice";

const BEFORE = new Date(RENAME_SHIPPED_AT - 86_400_000).toISOString();
const AFTER = new Date(RENAME_SHIPPED_AT + 86_400_000).toISOString();

describe("who is shown the rebrand notice", () => {
  it("shows it to an account that existed under the old name", () => {
    expect(
      shouldShowRebrandNotice({ seen: false, accountCreatedAt: BEFORE }),
    ).toBe(true);
  });

  /**
   * ⚠️ THE WHOLE POINT OF THE GATE. Somebody who signs up after the rename has
   * never heard of Trackd; announcing a name change to them makes a new product
   * feel like a renamed old one.
   */
  it("never shows it to an account created after the rename shipped", () => {
    expect(
      shouldShowRebrandNotice({ seen: false, accountCreatedAt: AFTER }),
    ).toBe(false);
  });

  it("does not show it twice", () => {
    expect(
      shouldShowRebrandNotice({ seen: true, accountCreatedAt: BEFORE }),
    ).toBe(false);
  });

  /**
   * ⚠️ SILENCE IS THE SAFE FAILURE HERE, AND IT INVERTS THE HOUSE RULE.
   *
   * Elsewhere an unreadable marker degrades to "show it", because a re-shown
   * notice is harmless while a suppressed one costs somebody their only
   * warning. This notice carries no warning — the failure it can cause is
   * announcing a rename to a stranger — so an unknown account age stays quiet.
   */
  it.each([
    ["missing", undefined],
    ["null", null],
    ["unparseable", "not-a-date"],
    ["empty", ""],
  ])("stays silent when the account age is %s", (_label, value) => {
    expect(
      shouldShowRebrandNotice({ seen: false, accountCreatedAt: value }),
    ).toBe(false);
  });

  /**
   * ⚠️ A SHARED BROWSER MUST NOT SILENCE THE NEXT PERSON. This is the D90
   * defect, inherited for free by reusing `betaNoticeStore`'s reader rather
   * than writing a third one.
   */
  it("keeps each account's dismissal separate on a shared browser", () => {
    expect(rebrandNoticeSeen("account-a", "account-a")).toBe(true);
    expect(rebrandNoticeSeen("account-a", "account-b")).toBe(false);
    expect(rebrandNoticeSeen("account-a~account-b", "account-b")).toBe(true);
  });

  it("treats an absent or mangled cookie as not seen", () => {
    expect(rebrandNoticeSeen(undefined, "account-a")).toBe(false);
    expect(rebrandNoticeSeen("%%%not-decodable", "account-a")).toBe(false);
  });

  /**
   * ⚠️ NEW COOKIE, NEW NAME — and its siblings keep the old spelling forever.
   * Renaming a live cookie orphans it rather than migrating it, which would
   * re-show a notice every existing account had already dismissed.
   */
  it("uses the new brand in its own cookie name", () => {
    expect(REBRAND_NOTICE_COOKIE).toBe("trakabl_rebrand_notice_seen");
  });
});
