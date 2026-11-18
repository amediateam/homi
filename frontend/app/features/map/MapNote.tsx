/**
 * The note over the map (BR-APP-062, KV-FE-031): «На карте {shown} из {total} · …» after an answer with listings
 * that have no location, or a locate failure in its place. The screen owns the text and its timers; `null` is no note.
 */
export function MapNote({ text }: { text: string | null }) {
  if (text === null) {
    return null;
  }
  return (
    <div
      data-map-note=""
      role="status"
      className="glass pointer-events-auto max-w-full animate-fade rounded-[14px] px-[14px] py-[8px] text-center text-[13px] leading-[1.35] font-medium text-text shadow-(--shadow-float)"
    >
      {text}
    </div>
  );
}
