"use client";

import type { ReactNode } from "react";

import {
  ChatCircleDots,
  Compass,
  InstagramLogo,
  TiktokLogo,
  UsersThree,
} from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import {
  ATTRIBUTION_DETAIL_MAX,
  normaliseAttributionDetail,
  type AttributionTag,
} from "@/lib/onboarding/session";
import { cn } from "@/lib/utils";

import { FlowCta, SkipLink, StepFrame } from "../chrome";
import { Chip } from "../controls";
import { useFlow } from "../flow-context";

/**
 * Screen 15 — Where did you hear about us? (Spec 3-01 §9).
 *
 * Optional, and single-select: unlike the two intent screens, this is one
 * answer about one origin.
 *
 * If a creator code arrived on the deep link, attribution is already recorded
 * and the strongest form of it (§4), so the screen says so rather than asking
 * the user to confirm something the link already told us.
 */

const ICON = "h-5 w-5";

const OPTIONS: { value: AttributionTag; label: string; icon: ReactNode }[] = [
  { value: "instagram", label: "Instagram", icon: <InstagramLogo className={ICON} /> },
  { value: "tiktok", label: "TikTok", icon: <TiktokLogo className={ICON} /> },
  // "A mate" → "A friend" (Adrian, 2026-08-01). Same person, one fewer
  // assumption about who is reading.
  { value: "mate", label: "A friend", icon: <ChatCircleDots className={ICON} /> },
  { value: "community", label: "A community or group", icon: <UsersThree className={ICON} /> },
  // "Someone else" → "Something else" (Adrian, 2026-08-05). The four options
  // above it are two platforms and two kinds of person, so the catch-all is
  // mostly a PLACE — a podcast, a forum, a search. The stored value is
  // untouched: `elsewhere` is what the session and the analytics carry, so this
  // is a label change and nothing else.
  { value: "elsewhere", label: "Something else", icon: <Compass className={ICON} /> },
];

export function AttributionScreen() {
  const { session, patch, goNext } = useFlow();

  const showDetail = session.attribution === "elsewhere";

  const onContinue = () => {
    // Tidy once, on the way out, and write it back so what is recorded and what
    // is stored are the same string.
    const detail = showDetail
      ? normaliseAttributionDetail(session.attributionDetail)
      : null;
    if (detail !== session.attributionDetail) patch({ attributionDetail: detail });

    if (session.attribution) {
      track("attribution_selected", {
        source: session.attribution,
        // The value itself, not just whether one was given: this is the
        // question the screen exists to answer.
        detail: detail ?? undefined,
      });
    }
    goNext();
  };

  /**
   * Skip CLEARS, it does not just leave.
   *
   * It used to be a bare `goNext`, so a user who tapped Instagram and then
   * tapped Skip (the screen says "Optional", so that is a normal thing to do)
   * left "instagram" on the session while `attribution_selected` never fired.
   * The device and the analytics then disagreed about the one fact this screen
   * exists to capture, and the stored answer would have been written to
   * Postgres as though they had confirmed it.
   */
  const onSkip = () => {
    if (session.attribution || session.attributionDetail) {
      patch({ attribution: null, attributionDetail: null });
    }
    goNext();
  };

  if (session.affiliateCode) {
    return (
      <StepFrame
        center
        title="Before you enter Trackd"
        sub="You came in on a creator link, so we already know where you heard about us."
        footer={<FlowCta onClick={goNext}>Continue</FlowCta>}
      >
        <div className="flex flex-1 items-center justify-center">
          <p className="font-mono text-sm uppercase tracking-[0.08em] text-text-muted">
            {session.affiliateCode}
          </p>
        </div>
      </StepFrame>
    );
  }

  return (
    <StepFrame
      center
      title="Before you enter Trackd"
      sub="Where did you hear about us? Optional."
      footer={
        <div className="space-y-1">
          <FlowCta onClick={onContinue}>Continue</FlowCta>
          <SkipLink onClick={onSkip}>Skip</SkipLink>
        </div>
      }
    >
      <div className="space-y-2">
        {OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            icon={option.icon}
            selected={session.attribution === option.value}
            onToggle={() =>
              patch({
                attribution:
                  session.attribution === option.value ? null : option.value,
                // Deselecting clears what was typed under it. Leaving an orphan
                // string on the session would send "a podcast" to the database
                // attached to whichever chip they picked instead.
                ...(session.attribution === option.value || option.value !== "elsewhere"
                  ? { attributionDetail: null }
                  : {}),
              })
            }
          />
        ))}

        {/* Unfolds under the catch-all chip, and ONLY under it. The whole
            reason the option exists is to collect the answers that are not on
            the list (Adrian, 2026-08-01), so "Someone else" with nowhere to say
            who is the one answer on this screen that teaches us nothing.
            Grid-rows so it animates open without its height being known. */}
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-[420ms] ease-[var(--motion-ease)] motion-reduce:transition-none",
            showDetail ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <input
              value={session.attribution === "elsewhere" ? (session.attributionDetail ?? "") : ""}
              // CAPPED here, never normalised here. `normaliseAttributionDetail`
              // trims and collapses whitespace, which on a per-keystroke change
              // eats the space the moment you type it: "a podcast" then a space
              // then "n" would land as "a podcastn". Tidying happens at the
              // boundaries (on Continue, on read from storage, and again on the
              // server), which is where it belongs.
              onChange={(e) =>
                patch({
                  attributionDetail:
                    e.target.value.slice(0, ATTRIBUTION_DETAIL_MAX) || null,
                })
              }
              // Not focusable while folded away, or a keyboard user tabs into a
              // field they cannot see.
              tabIndex={showDetail ? 0 : -1}
              aria-hidden={!showDetail}
              maxLength={ATTRIBUTION_DETAIL_MAX}
              placeholder="Who, or where? Optional."
              aria-label="Where you heard about us"
              autoComplete="off"
              className="mt-2 h-12 w-full rounded-xl bg-bg-input px-4 text-sm text-foreground outline-none placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </div>
    </StepFrame>
  );
}
