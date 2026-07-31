import { containerColour } from "@/lib/containers/colour";
import { containerFormFor } from "@/lib/containers/form";
import { Bottle } from "./Bottle";
import { Tub } from "./Tub";
import { Vial } from "./Vial";
import type { ContainerProps } from "./types";

/**
 * A compound's container, chosen by its **form** and tinted by its **stack or
 * category** (Spec 01 · part two). This is the entry point every screen uses —
 * Homepage, Protocol, Progress, add-compound and log-a-dose all render it, so
 * none of them re-derives the form or the colour.
 */
export interface CompoundContainerProps
  extends Omit<ContainerProps, "colour"> {
  /** `reconstituted | preconcentrated | oral_solid`, from the compound's route. */
  inventoryType?: string | null;
  /** Catalogue category; absent or unknown on a custom compound. */
  category?: string | null;
  /** The stack's colour when this compound is in one — overrides the category. */
  stackColour?: string | null;
}

export function Container({
  inventoryType,
  category,
  stackColour,
  ...rest
}: CompoundContainerProps) {
  const colour = containerColour({ category, stackColour });

  switch (containerFormFor({ inventoryType, category })) {
    case "vial":
      return <Vial colour={colour} {...rest} />;
    case "tub":
      return <Tub colour={colour} {...rest} />;
    default:
      return <Bottle colour={colour} {...rest} />;
  }
}
