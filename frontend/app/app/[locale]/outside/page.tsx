import { OutsideScreen } from "@/features/gates/OutsideScreen";

/** Outside Telegram (SCR-002, WP-23); the server renders the whole page, so its HTML names the route. */
export default function OutsidePage() {
  return (
    <main data-route="outside" className="mx-auto w-full max-w-(--feed-max) pt-(--top-inset) pb-(--bottom-inset)">
      <OutsideScreen />
    </main>
  );
}
