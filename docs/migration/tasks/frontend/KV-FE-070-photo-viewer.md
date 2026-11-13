# KV-FE-070 — Photo viewer

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-2 (M9, stage S4) |
| Feature IDs | F-LISTING-002 |
| Dependencies | KV-FE-063, KV-FE-025 |

## Goal

A tap on a hero photo opens the black fullscreen gallery (SCR-020) at that photo: horizontal snap paging with a
«N / M» counter, pinch zoom up to 4×, double-tap to 2.5×, panning while zoomed, and swipe-down to close with a fading
background. Gesture handlers always see the current callbacks (LB-APP-004 fixed).

## Legacy reference

- Screen: SCR-020 (`03` §2).
- Code: `$KVADRO_ROOT/demo/app/src/features/listing/PhotoViewer.jsx:14-75` (start index before first paint, counter,
  `locked` body class, Back handler), `$KVADRO_ROOT/demo/app/src/features/listing/ZoomableImage.jsx:5-269`
  (`MAX_ZOOM = 4`, `DOUBLE_TAP_ZOOM = 2.5`, `SWIPE_CLOSE_PX = 110`, double-tap window 300 ms, pan clamping, transform
  easing `0.25s cubic-bezier(0.2, 0.9, 0.3, 1)`, zoom reset when the slide is left).
- Constants: `03` §3.4 («Photo zoom | max 4×, double tap 2.5×, swipe-close 110 px»).
- Photos: RES-001 (800 px) for the viewer; BR-APP-059 (thumbnail and `srcset` rules apply to cards, the viewer loads
  the full image).
- Defect: LB-APP-004 → `APPROVED` fix.
- Visual baseline (KV-QA-019): `listing-photo` → `SCR-020-*.png`.

## Implementation

1. `features/listing/viewer/PhotoViewer.tsx`: a layer (z 100) in the back stack of KV-FE-025 (Back closes it before
   the listing); body class `locked` while open; `role="dialog"`, `aria-label` `viewer.title` «Фото».
2. Strip: horizontal scroll-snap; before the first paint set `scrollLeft = start × clientWidth` (layout effect);
   current index = `round(scrollLeft / clientWidth)`; the strip is locked (class `zoomed`) while the current image is
   zoomed.
3. Top bar: × (aria `common.close`) and the counter `{index + 1} / {photos.length}` when there is more than one photo.
4. `viewer/ZoomableImage.tsx`: transform `{s, tx, ty}` kept in a ref and written to `style.transform` (no re-render per
   frame); handlers read `onZoom`, `onDrag`, `onClose` through refs updated on every render (LB-APP-004); pinch around
   the midpoint, clamp scale to `[1, 4]`, clamp pan to the container; double tap (< 300 ms, near the last tap) toggles
   1× ↔ 2.5× around the tap point; at 1× a vertical drag moves the image and reports progress `0…1` (background fades
   through the CSS variable `--drag`); release beyond 110 px closes, otherwise springs back; leaving a slide resets its
   zoom.
5. Pointer events with `touch-action: none` on the image; the strip keeps native horizontal scrolling at 1×.
6. Images: the `photos` array of details (full set); `Photo` component of KV-FE-047 without the thumbnail downgrade;
   `decoding="async"`; failed images show the placeholder of `Photo`.

## States and texts

| State | Rendering and keys |
| ----- | ------------------ |
| open | black background, image `start`, counter «N / M» (no key) |
| single photo | no counter |
| zoomed | strip locked, pan enabled |
| dragging down | background opacity follows `--drag` |
| image error | `Photo` placeholder in the slide; paging still works |
| labels | `viewer.title` «Фото» (dialog), `common.close` «Закрыть» (×) |

## Interaction

- Pinch zoom up to 4×; double tap 2.5× / back to 1×; pan only when zoomed; swipe down > 110 px closes (only at 1×).
- Transitions: transform easing 0.25 s `cubic-bezier(.2,.9,.3,1)`; animation `viewer-in` on open; reduced motion → no
  transition, instant open and close.
- × and Telegram Back close; the swipe-back gesture of the listing is disabled while the viewer is open (KV-FE-063).
- Responsive: images `object-fit: contain` within the viewport; safe-area padding for the top bar; desktop windows
  allow mouse drag for paging and wheel-free zoom only by double click.

## Telegram integration

TMA-022 (Back closes the viewer), TMA-015 (vertical swipes disabled, so swipe-down does not collapse the Mini App),
TMA-025 (light haptic on the opening tap, sent by KV-FE-063).

## Storage and analytics

- Storage: none.
- Analytics: none in legacy (LB-APP-037); a `$pageview` is added only if KV-FE-035 adopts layer tracking.

## Files

- `frontend/app/app/(miniapp)/features/listing/viewer/{PhotoViewer,ZoomableImage}.tsx` (new)
- `frontend/app/app/(miniapp)/features/listing/viewer/gestures.ts` (new: pure maths for zoom, clamp, double tap)
- Tests: `frontend/app/tests/listing/{gestures,PhotoViewer}.test.ts(x)`, `frontend/app/e2e/photo-viewer.spec.ts`

## API contract

n/a — no request. Uses `ListingDetails.photos: string[]` (signed `/media/<id>/<n>.jpg?e=&s=`, RES-001) from API-008.

## Business rules

- Kept: the gesture constants of `03` §3.4; RES-001 for full-size images.
- LB fix `APPROVED` (policy): LB-APP-004 (callbacks through refs).

## Acceptance criteria

- Opening photo 3 of 7 shows photo 3 in the first frame (no visible scroll from photo 1) and «3 / 7».
- Pinch never exceeds 4×; double tap toggles 2.5× around the tapped point; panning never shows the background beyond
  the image edges.
- Swipe down 120 px closes; 80 px springs back.
- Paging is impossible while zoomed; swiping to another photo resets the previous one to 1×.
- Replacing `onClose` between renders (test harness) is honoured by the next gesture (LB-APP-004).
- Visual: side by side with the `listing-photo` baseline (bar, counter, black background).

## Tests

- Unit `gestures.test.ts`: scale clamp, pan clamp for given container sizes, double-tap detection window and distance,
  close threshold.
- Component `PhotoViewer.test.tsx`: start index, counter visibility, Back handler registration and removal, `locked`
  class lifecycle, callback refresh.
- E2E `photo-viewer.spec.ts` (touch emulation): open, page, double tap, swipe down closes.

## Edge cases

- `photos` contains one item: no counter, swipe-down still closes.
- Orientation change while zoomed: reset to 1× and re-snap to the current index.
- A very wide panorama: contained, pan limited horizontally only when zoomed.
- The listing is closed by the Settings button while the viewer is open: the viewer unmounts with it (KV-FE-025 reset).

## Security

- SEC-REQ-025: photos are loaded only from the signed media URLs given by the API; no other host.
- No photo URL is sent to analytics.

## Definition of done

`make ci-frontend` green; tests above green (or added when KV-FE-010 lands); visual review against the `SCR-020`
baseline recorded in the PR; parity gate G4 for F-LISTING-002 ticked (`15` §4); the feature row in `09` updated; PR
reviewed by the other developer.
