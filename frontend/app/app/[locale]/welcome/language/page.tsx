import { LanguagePicker } from "@/features/gates/LanguagePicker";

/**
 * First-launch language (SCR-004, WP-23). The root is server-rendered with its route name (D-S-16); the picker draws
 * once the session is ready and waits quietly before.
 */
export default function Page() {
  return (
    <main
      data-route="welcome/language"
      className="mx-auto flex min-h-dvh w-full max-w-(--feed-max) flex-col pt-(--top-inset) pb-(--bottom-inset)"
    >
      <LanguagePicker />
    </main>
  );
}
