/**
 * The screen the user sees (WP-32, `03` §1.1): the name of the address (`ScreenTracker`, `screenNameOf`), and above it
 * the names of layers that have no address of their own (`useScreenLayer`, `features/shell/useScreenLayer.ts`); the
 * top layer wins. Read by error reports (`currentScreen()`) and by PostHog's pageviews. No React here: the global
 * error handlers load this module before hydration.
 */

let address = "";
const layers: { id: number; name: string }[] = [];
let next = 0;

/** The name of the screen on top: the last layer pushed, else the address's. */
export function currentScreen(): string {
  return layers.at(-1)?.name ?? address;
}

/** The address's screen (`ScreenTracker`). */
export function setScreen(name: string): void {
  address = name;
}

/** Pushes a layer's name; the returned function removes exactly that entry. */
export function pushScreenLayer(name: string): () => void {
  const id = (next += 1);
  layers.push({ id, name });
  return () => {
    const at = layers.findIndex((layer) => layer.id === id);
    if (at >= 0) {
      layers.splice(at, 1);
    }
  };
}

/** Tests only. */
export function resetScreens(): void {
  address = "";
  layers.length = 0;
}
