"use client";

import { Container, type CompoundContainerProps } from "./Container";
import { useAnimatedFill } from "./useAnimatedFill";

/**
 * {@link Container}, with its level EASING to a new one rather than jumping.
 *
 * A separate component rather than a prop on `Container` for one reason:
 * `Container` has no `"use client"` and is rendered from server components, and
 * a hook cannot live there. Callers that want the motion reach for this one; the
 * default stays free.
 *
 * See {@link useAnimatedFill} for why the number is eased rather than the SVG.
 */
export function AnimatedContainer({
  fill,
  durationMs,
  ...rest
}: CompoundContainerProps & { durationMs?: number }) {
  const eased = useAnimatedFill(fill, durationMs);
  return <Container fill={eased} {...rest} />;
}
