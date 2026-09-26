"use client";

import { removeCustomMarker } from "@/app/(app)/progress/actions";
import { customMarkerUserMarkerId, type MarkerOption } from "@/lib/progress/journal";
import { createRemovalQueue } from "@/lib/progress/markerPick";
import { showToast, TOAST_MS } from "@/lib/toast";

/**
 * YOUR OWN MARKERS, REMOVED WITH AN UNDO (Yours, Edit, x). One queue for the
 * app, outside any dialer (cold review B6): a removal is held for the toast's
 * Undo, then sent, whatever happens to the dialer that asked for it. Closing the
 * journal or switching its tile neither sends it early nor takes the Undo away,
 * and the Undo still works after the dialer has gone. Every dialer keeps out
 * what is held, being sent or gone, so a marker never flickers back while the
 * server catches up.
 *
 * Past the Undo window it keeps ids only, never a name another account could
 * see after a sign-out in the same tab; the markers you make stay with the
 * dialer that made them.
 * Written only from event handlers (in the browser); the server snapshot is
 * always empty.
 */

interface Held {
  marker: MarkerOption;
  /** Re-reads the page's data once the server has it (`router.refresh`). */
  refresh: () => void;
}

const EMPTY: ReadonlySet<string> = new Set();
const sending = new Set<string>();
const gone = new Set<string>();
let hidden: ReadonlySet<string> = EMPTY;
const listeners = new Set<() => void>();

function recompute() {
  hidden = new Set([...queue.ids(), ...sending, ...gone]);
  listeners.forEach((l) => l());
}

const queue = createRemovalQueue<Held>(({ marker, refresh }, id) => {
  sending.add(id);
  recompute();
  void removeCustomMarker(customMarkerUserMarkerId(id))
    .then(
      (res) => res,
      () => ({ ok: false as const }),
    )
    .then((res) => {
      sending.delete(id);
      if (res.ok) {
        gone.add(id);
        refresh();
      } else {
        // The server still has it: it shows again, so the picker matches it.
        showToast(`Couldn’t remove ${marker.name}. Try again.`);
      }
      recompute();
    });
});
queue.subscribe(recompute);

/** Hold a removal for the toast's Undo window, then send it. */
export function holdRemoval(marker: MarkerOption, refresh: () => void) {
  queue.schedule(marker.id, { marker, refresh }, TOAST_MS.undo + 150);
}

/** The toast's Undo. True if the removal was still held (nothing was sent). */
export function undoRemoval(id: string): boolean {
  return queue.cancel(id);
}

/** For `useSyncExternalStore`: the ids of your own markers no dialer offers. */
export function subscribeRemoved(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function removedMarkers(): ReadonlySet<string> {
  return hidden;
}
export function noRemovedMarkers(): ReadonlySet<string> {
  return EMPTY;
}
