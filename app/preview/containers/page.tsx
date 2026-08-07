import { notFound } from "next/navigation";

import { Bottle, Container, Tub, Vial } from "@/components/containers";
import { NEUTRAL_CONTAINER_COLOUR, containerColour } from "@/lib/containers/colour";
import { CATEGORY_META, type CompoundCategory } from "@/lib/compound-categories";
import { CARD_EYEBROW, DATA_MONO, PAGE_TITLE } from "@/lib/ui-presets";
import { FillDemo } from "./FillDemo";

/**
 * DEMO page for the containers (Spec 01 · part two). Restored after the original
 * review so the artwork can be shown without signing in.
 *
 * Shows all three containers at several fill levels and in every category
 * colour so they can be reviewed together before any screen renders them.
 *
 * Unlike the other `/preview/*` harnesses this gates on `VERCEL_ENV` rather than
 * `NODE_ENV`: a Vercel preview deploy IS a production build, so a `NODE_ENV`
 * gate would 404 on the exact link this page exists to be reviewed through. It
 * still never renders on the production domain.
 */
const FILLS = [0, 0.25, 0.5, 0.75, 1];

const CATEGORIES = Object.keys(CATEGORY_META) as CompoundCategory[];

export default function PreviewContainersPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  return (
    <main className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <header className="space-y-1">
        <h1 className={PAGE_TITLE}>Containers</h1>
        <p className="text-sm text-text-muted">
          Review harness for the drawn vial, bottle and tub. Not a shipping screen.
        </p>
      </header>

      {/* All three fills are real as of Spec w2b-13, Step 3. */}
      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>Vial · fill level</h2>
        <div className="flex items-end justify-between gap-2">
          {FILLS.map((fill) => (
            <div key={fill} className="flex flex-col items-center gap-2">
              <Vial colour="var(--cat-peptide)" fill={fill} size={84} />
              <span className={DATA_MONO}>{Math.round(fill * 100)}%</span>
            </div>
          ))}
        </div>
      </section>

      {/* The tub's powder level: a surface that falls, like the vial's. */}
      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>Tub · fill level</h2>
        <div className="flex items-end justify-between gap-2">
          {FILLS.map((fill) => (
            <div key={fill} className="flex flex-col items-center gap-2">
              <Tub colour="var(--cat-supplement)" fill={fill} size={84} />
              <span className={DATA_MONO}>{Math.round(fill * 100)}%</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-muted">
          Grams remaining against the tub weight. The surface narrows below a
          fifth full, so the last of it reads as a heap rather than a thin disc.
        </p>
      </section>

      {/* The bottle empties by COUNT — it has no surface to draw. */}
      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>Bottle · fill level</h2>
        <div className="flex items-end justify-between gap-2">
          {FILLS.map((fill) => (
            <div key={fill} className="flex flex-col items-center gap-2">
              <Bottle colour="var(--cat-oral)" fill={fill} size={84} />
              <span className={DATA_MONO}>{Math.round(fill * 100)}%</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-muted">
          Tablets leave from the top down as the count falls. There is no liquid
          surface to draw, so the count is the level.
        </p>
      </section>

      {/* Animation + reduced-motion check. */}
      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>Fill animation · 400ms ease-out</h2>
        <FillDemo colour="var(--cat-anabolic)" />
        <p className="text-xs text-text-muted">
          Under reduced motion the level jumps rather than easing.
        </p>
      </section>

      {/* Every category colour, all three forms. */}
      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>Category colours</h2>
        <div className="divide-y divide-border-default">
          {CATEGORIES.map((category) => {
            const colour = containerColour({ category });
            return (
              <div key={category} className="flex items-center gap-4 py-3">
                <div className="flex items-end gap-2">
                  <Vial colour={colour} fill={0.7} size={56} />
                  <Bottle colour={colour} size={56} />
                  <Tub colour={colour} size={56} />
                </div>
                <span className={`${DATA_MONO} ml-auto uppercase tracking-[0.08em]`}>
                  {CATEGORY_META[category].label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Fallbacks and overrides. */}
      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>No category · stack override</h2>
        <div className="divide-y divide-border-default">
          <div className="flex items-center gap-4 py-3">
            <div className="flex items-end gap-2">
              <Vial colour={NEUTRAL_CONTAINER_COLOUR} fill={0.7} size={56} />
              <Bottle colour={NEUTRAL_CONTAINER_COLOUR} size={56} />
              <Tub colour={NEUTRAL_CONTAINER_COLOUR} size={56} />
            </div>
            <span className={`${DATA_MONO} ml-auto uppercase tracking-[0.08em]`}>
              Stone grey
            </span>
          </div>
          <div className="flex items-center gap-4 py-3">
            <div className="flex items-end gap-2">
              <Vial colour="var(--cat-ancillary)" fill={0.7} size={56} />
              <Bottle colour="var(--cat-ancillary)" size={56} />
              <Tub colour="var(--cat-ancillary)" size={56} />
            </div>
            <span className={`${DATA_MONO} ml-auto uppercase tracking-[0.08em]`}>
              Stack colour
            </span>
          </div>
        </div>
      </section>

      {/* The resolver: form picks the component, never the category. */}
      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>Resolved by form</h2>
        <div className="divide-y divide-border-default">
          {[
            { label: "Testosterone", inventoryType: "preconcentrated", category: "anabolic" },
            { label: "BPC-157", inventoryType: "reconstituted", category: "peptide" },
            { label: "Anavar", inventoryType: "oral_solid", category: "oral" },
            { label: "Oral anabolic", inventoryType: "oral_solid", category: "anabolic" },
            // The two supplements are the point: same category, same inventory
            // type, different container, because the catalogue prices one in
            // grams and the other in iu.
            { label: "Creatine Monohydrate", inventoryType: "oral_solid", category: "supplement" },
            { label: "Vitamin D3", inventoryType: "oral_solid", category: "supplement" },
            { label: "Custom, no category", inventoryType: null, category: null },
          ].map((c) => (
            <div key={c.label} className="flex items-center gap-4 py-3">
              <Container
                name={c.label}
                inventoryType={c.inventoryType}
                category={c.category}
                fill={0.7}
                size={56}
              />
              <span className={`${DATA_MONO} ml-auto uppercase tracking-[0.08em]`}>
                {c.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Sizing from one viewBox — no small/large variants. */}
      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>Sizes</h2>
        <div className="flex items-end gap-4">
          {[28, 44, 64, 96, 128].map((size) => (
            <Vial key={size} colour="var(--cat-sarm)" fill={0.7} size={size} />
          ))}
        </div>
      </section>
    </main>
  );
}
