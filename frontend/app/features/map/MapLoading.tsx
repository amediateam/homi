import { Spinner } from "@homi/ui";

/**
 * WP-27 "States", engine loading: a centred spinner, no text, while the engine, the view's chunk or the map library
 * is pending — the route's fallback, `MapScreen` before the engine is known and while the view's chunk loads, and the
 * GL view until its first map exists.
 */
export function MapLoading() {
  return (
    <div data-map-engine-loading="" className="fixed inset-0 grid place-items-center">
      <Spinner className="size-[28px]" />
    </div>
  );
}
