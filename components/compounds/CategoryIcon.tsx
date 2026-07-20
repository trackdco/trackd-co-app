"use client";

import { Cylinder, Pill, TestTube, type Icon } from "@/components/icons";

import { cn } from "@/lib/utils";
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
  type CompoundForm,
} from "@/lib/compound-categories";

/**
 * The little type icon next to a compound — a vial (injectable), tablet (oral), or
 * tub (supplement), coloured by the compound's category (see
 * `Context/ui-context.md` → "Compound type icons"). Replaces the old plain
 * category dot: the shape tells you the FORM at a glance, the colour the category.
 * An organisational legend, never a health-data value.
 */
const FORM_ICON: Record<CompoundForm, Icon> = {
  injectable: TestTube,
  oral: Pill,
  supplement: Cylinder,
};

export function CategoryIcon({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const meta = CATEGORY_META[category as CompoundCategory] ?? FALLBACK_CATEGORY_META;
  const Ico = FORM_ICON[meta.form];
  return <Ico className={cn("h-4 w-4 shrink-0", meta.tint, className)} aria-hidden />;
}
