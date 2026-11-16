import { NoAccessScreen } from "@/features/gates/NoAccessScreen";

/**
 * No access (SCR-003, WP-23). The root is rendered by the server, so the route is named in its HTML; the screen inside
 * reads the refusal from the session on the client. `?reason=` of the address is informative only.
 */
export default function NoAccessPage() {
  return (
    <main
      data-route="no-access"
      className="mx-auto flex min-h-dvh w-full max-w-(--feed-max) flex-col pt-(--top-inset) pb-(--bottom-inset)"
    >
      <NoAccessScreen />
    </main>
  );
}
