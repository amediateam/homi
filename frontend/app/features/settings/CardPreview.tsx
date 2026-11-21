import { Image as ImageIcon } from "@homi/ui";
import { useTranslations } from "next-intl";

/**
 * The mocks of the bot's two card messages (WP-31, SCR-048; legacy `CardStylePicker.jsx` and `card-style.css`, as
 * tokens): a chat background, the message bubble with a photo placeholder and the caption, and the button rows. The
 * texts are the catalogue's `settings.cards.demo.*`. Decorative: the option that holds a mock names it.
 */
const BUBBLE = "min-w-0 overflow-hidden rounded-[11px_11px_11px_4px] bg-bg shadow-[0_1px_2px_#00000014] [[data-scheme=dark]_&]:bg-fill";
const TEXT = "flex min-w-0 flex-col gap-[1px] px-[7px] pt-[6px] pb-[7px] text-[9.5px] leading-[1.35] text-text [&>p]:m-0 [&>p]:truncate";
const SOFT = "bg-[color-mix(in_srgb,var(--text)_6%,transparent)]";

function Photo({ dots = false }: { dots?: boolean }) {
  return (
    <div className="relative grid aspect-[16/10] place-items-center bg-[color-mix(in_srgb,var(--text)_10%,var(--bg))] text-hint">
      <ImageIcon size={26} strokeWidth={1.5} />
      {dots ? (
        <span className="absolute inset-x-0 bottom-[5px] flex justify-center gap-[3px]">
          {[0, 1, 2, 3].map((index) => (
            <i key={index} className={index === 0 ? "size-[4px] rounded-full bg-text" : "size-[4px] rounded-full bg-[color-mix(in_srgb,var(--text)_25%,transparent)]"} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

function Buttons({ rows }: { rows: readonly (readonly string[])[] }) {
  return (
    <div className="flex flex-col gap-[3px]">
      {rows.map((row) => (
        <div key={row.join()} className="flex gap-[3px]">
          {row.map((label) => (
            <span key={label} className="grid h-[16px] flex-1 place-items-center rounded-[5px] bg-[color-mix(in_srgb,var(--text)_16%,var(--bg))] text-[9px] text-text">
              {label}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardPreview({ style }: { style: "classic" | "rich" }) {
  const t = useTranslations();
  const demo = (key: string) => t(`settings.cards.demo.${key}` as Parameters<typeof t>[0]);
  const rows: [string, string][] = [
    [demo("rowDistrict"), demo("district")],
    [demo("rowMetro"), demo("metro")],
    [demo("rowArea"), demo("areaShort")],
    [demo("rowOwner"), demo("ownerShort")],
  ];
  return (
    <div aria-hidden data-card-preview={style} className="pointer-events-none flex flex-col justify-start gap-[3px] rounded-[13px] bg-[color-mix(in_srgb,var(--text)_7%,var(--bg))] px-[8px] py-[9px]">
      <div className={BUBBLE}>
        <Photo dots={style === "rich"} />
        {style === "classic" ? (
          <div className={TEXT}>
            <p>
              🏠 <b>{demo("title")}</b>
            </p>
            <p>
              💰 <b>{demo("price")}</b>
            </p>
            <p>📊 {demo("median")}</p>
            <p className="mt-[4px]!">📍 {demo("place")}</p>
            <p>🏢 {demo("area")}</p>
            <p>🏠 {demo("owner")}</p>
            <p className={`mt-[4px]! rounded-[3px] border-l-2 border-hint px-[5px] py-[3px] text-hint ${SOFT}`}>{demo("quote")}</p>
          </div>
        ) : (
          <div className={TEXT}>
            <p className="text-[15px] leading-[1.2] font-bold tracking-[-0.01em]">{demo("price")}</p>
            <p>
              <b>{demo("title")}</b>
            </p>
            <p>📊 {demo("median")}</p>
            <table className="mt-[4px] w-full table-fixed border-collapse text-[8.5px]">
              <tbody>
                {rows.map(([name, value]) => (
                  <tr key={name}>
                    <td className="w-[45%] truncate border-[0.5px] border-sep px-[3px] py-[2px] font-semibold">{name}</td>
                    <td className="truncate border-[0.5px] border-sep px-[3px] py-[2px]">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={`mt-[4px]! flex! justify-between rounded-[4px] px-[5px] py-[3px] font-semibold ${SOFT}`}>
              <span>{demo("details")}</span>
              <span>›</span>
            </p>
          </div>
        )}
      </div>
      <Buttons rows={style === "classic" ? [["📱", "📍"], ["🔗", "📷 +5"], ["⭐", "…"]] : [["📱", "📍"], ["🔗", "⭐"], ["…"]]} />
    </div>
  );
}
