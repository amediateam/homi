import { WelcomeCity } from "@/features/gates/WelcomeCity";

/**
 * First-launch city (SCR-005, WP-23). The root is server-rendered with its route name (D-S-16); the city list draws
 * once the session is ready and waits quietly before.
 */
export default function Page() {
  return (
    <main
      data-route="welcome/city"
      className="mx-auto flex min-h-dvh w-full max-w-(--feed-max) flex-col pt-(--top-inset) pb-(--bottom-inset)"
    >
      <WelcomeCity />
    </main>
  );
}
