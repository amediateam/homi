# KV-FE-112 — Landing live pushes, owner/agent switch, savings block, FAQ

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | Frontend (track: development) |
| Complexity | M |
| Milestone | FE-3b (M9, stage S4) |
| Feature IDs | F-LANDING-003, F-LANDING-004 |
| Dependencies | KV-FE-107 (data), KV-FE-108 (frame), KV-FE-109 (versions); decisions: DEV-039 `PROPOSED`, Q-LND-010, DEC-04 (copy) |

## Goal

The content sections below the first scene work as in legacy and tell the truth: «Узнавайте первым» with the
lock-screen phone, dripping real pushes and the new-listings counter; the «Хозяин ◐ Риелтор» switch with its evidence
cards; «Сразу видно, где дешевле рынка» with the yearly-saving calculation over real district medians (and never over
point medians); and the eight-question FAQ — all server-rendered from the same data snapshot.

## Legacy reference

- LND-012 (`#live` section: same heading and lead as the lock phase, a 390 × 844 lock-screen phone scaled, counter
  `#live-count`; shown where the v1 lock phase does not run; v2: bigger phone cropped from the top (`lcrop`), the dark
  scene above slides away with up to 260 px parallax; clock and date in `Asia/Tashkent`; pushes drip one per second
  while ≥ 35 % visible; ages relative to the snapshot, refreshed every 30 s; without JS one example push stays),
  LND-013 (owner/agent switch), LND-014 (savings block), LND-015 (FAQ: eight `<details>`, two independent columns, the
  first open, no `FAQPage` JSON-LD), LND-011 (the lock phase it replaces).
- Rules: BR-LND-007 (counters: `day` if ≥ 100, else `week` if ≥ 100, else hidden; count-up 1.2 s ease-out cubic),
  BR-LND-008 (savings: `cheap = round10(median × 0.8)`, yearly saving `(median − cheap) × 12`; defaults 2 rooms,
  `chilonzor`; medians with `rooms ∈ 1..3` and `median_usd > 0`; district buttons ordered by the sum of `n` over all
  rooms, descending; if the selected district lacks the rooms, the first entry is selected; `PC_FALLBACK` before data),
  BR-LND-009 (weekly bargains line ≥ 100), BR-LND-012 (tones), BR-LND-014 (pushes: ≤ 4, oldest first, drip, ages from
  the snapshot `now`, clock and date in `Asia/Tashkent`, Uzbek date by hand «seshanba, 13-oktabr»).
- Defects and deviations: LB-LND-004 (point medians as districts, fix `APPROVED`), LB-LND-006 → DEV-039 (placeholder
  numbers), Q-LND-010 (20 % «bargain» vs the 10 % tone).
- Source: `$KVADRO_ROOT/demo/landing/site/index.html:282-410`; `$KVADRO_ROOT/demo/landing/site/landing.js:81-128`,
  `:1939-2140`, `:2241-2318`, `:2396-2400`.

## Implementation

1. `frontend/landing/components/landing/LiveSection.tsx`: Server Component for the heading `lock.h2` «Узнавайте
   первым», the lead `lock.lead`, the counter (server-rendered final number; the count-up is a client enhancement) and
   the static first push; a Client child drips the remaining pushes (`Push` component shared with KV-FE-110) using an
   IntersectionObserver at 0.35, one per second, all at once under reduced motion; ages re-rendered every 30 s relative
   to `live.json` `now`; the lock-screen clock and date formatted in `Asia/Tashkent` with the hand-tabled uz names
   (KV-FE-102). Visibility: hidden where the v1 lock phase of KV-FE-110 runs (CSS, as legacy).
2. Without data or JavaScript (DEV-039 flag `dev039NoPlaceholderNumbers`, KV-FE-107): off → the legacy example push
   «kvadro² · только что · 2-комн. квартира · Мирабад · $600/мес · −23% к рынку» and the decorative 9:41 clock; on →
   the first real push from the snapshot, or no push and a hidden counter when there is no data.
3. `OwnerAgentSwitch.tsx`: the heading itself is the switch (`role=switch`): «Хозяин» [toggle] «Риелтор»
   (`or2.owner`, `or2.agent`), visually hidden `h2` `or2.title` «Хозяин или риелтор?»; owner side three cards
   (Chilonzor $650, Mirzo-Ulugbek $550, Yunusobod $850) with the badge «Хозяин» and evidence `ev.ownerSays`
   «В тексте: «сдаёт хозяин»» / `ev.ownerTag` «В тексте: #хозяева»; agent side three cards (Chilonzor $550, Yakkasaroy
   $750, Shayxontohur $700) with `ev.agentPhone` «Номер — ещё в 12 объявлениях. **По тексту не угадать**»,
   `ev.agentFee` «В тексте: «комиссия 50%»», `ev.agentSeen` «Номер уже был в объявлениях риелтора»; leads
   `or2.lead.owner` / `or2.lead.agent`; sets slide in the switch direction (200 ms out, 380 ms in; none under reduced
   motion); on phones each set scrolls sideways; card parameters from structured data (`2,60,1,7` → «2‑комн. · 60 м² ·
   1/7 эт.», `rooms.short` per language); photos `img/own-*.webp`, `img/ag-*.webp` (static demo assets, FD-8).
4. `SavingsBlock.tsx`: lead `pc.pre` «Снять квартиру на 20% дешевле обычной цены — это», the big yearly number with
   `pc.year` «экономии за год», the explanation `pc.what` «{kind} в районе {district} обычно стоит {median} в месяц.
   Каждую квартиру мы сравниваем с похожими рядом и в районе и отмечаем те, что заметно дешевле, — например, за
   {cheap}.» (`pc.kind.1|2|3` «Однушка», «Двушка», «Трёшка»), room buttons `pc.rooms.1|2|3` (`pc.roomsAria` «Комнаты»),
   the horizontally scrolling district row (`pc.districtAria` «Район»), and the weekly line «N квартир» (`pc.week`
   plural) + `pc.weekRest` « на 20% и больше дешевле обычной цены нашли за неделю в Ташкенте», shown only when
   `bargains_week ≥ 100`. Server-render the default (2 rooms, Chilonzor) from the snapshot; the client handles the
   buttons. Only `district_code`s with a dictionary name are rendered (LB-LND-004). With DEV-039 off and no data, the
   legacy `PC_FALLBACK` medians apply; on, the block hides its numbers.
5. `Faq.tsx`: `faq.h2` «Вопросы» and eight `<details>` (`faq.q1`…`faq.q8` / `faq.a1`…`faq.a8`, e.g. «Сколько это
   стоит?» → «Нисколько — kvadro² абсолютно бесплатный.»), two columns of independent height, the first open; answers
   keep their rich text (KV-FE-102). The answers that state product facts (free-text radar requests, `/privacy`,
   «Уже сдано») are reviewed against HOMI behaviour before S4 (DEC-04 copy owner).

## States and texts

| State | Shown when | Texts and behaviour |
| ----- | ---------- | ------------------- |
| loading | client part not yet hydrated | server HTML: counter final value, first push, default savings, FAQ |
| success | snapshot valid | drip pushes, counter count-up, savings interactive |
| empty | `latest` empty / `bargains_week` < 100 / counters < 100 | no pushes; weekly line hidden; counter hidden (BR-LND-007, BR-LND-009) |
| error / no data | fetch failed | DEV-039 off: legacy examples (example push, `PC_FALLBACK`); on: numbers hidden |
| disabled | reduced motion | no drip, no slide, no count-up: final states at once |

## Interaction

- Switch: click, Space and Enter toggle; `aria-checked` reflects the side; arrows not required.
- Savings: room and district buttons (`aria-pressed`); the district row scrolls horizontally on phones without moving
  the page.
- FAQ: native `<details>`; keyboard accessible.
- Responsive: two FAQ columns from 760 px, one below; lock phone scaled per KV-FE-109.

## Telegram integration

n/a (pushes link to their `link` deep links, validated by KV-FE-106).

## Storage and analytics

None written. Autocapture of the switch, room and district buttons (KV-FE-105; stable `data-ph` attributes per
Q-LND-008).

## Files

- `frontend/landing/components/landing/{LiveSection,OwnerAgentSwitch,SavingsBlock,Faq}.tsx` (new)
- `frontend/landing/lib/landing/savings.ts` (BR-LND-008 pure functions), `frontend/landing/lib/landing/counter.ts`
- `frontend/landing/public/img/{own-chil,own-mirzo,own-yunus,ag-chil,ag-yakka,ag-shay}.webp` (demo assets, FD-8)
- `frontend/landing/tests/savings.test.ts`, `frontend/landing/tests/counter.test.ts`, `frontend/landing/e2e/landing-sections.spec.ts`

## API contract

`live.json` (`now`, `day`, `week`, `latest[]`) and `pins-rent.json` (`medians[]`, `bargains_week`) via KV-FE-107.

## Business rules

- Kept: BR-LND-007, BR-LND-008, BR-LND-009, BR-LND-012, BR-LND-014.
- Defect fix `APPROVED`: LB-LND-004.
- DEV-039 `PROPOSED` behind `dev039NoPlaceholderNumbers` (test `todo('DEV-039 PROPOSED')`).
- Q-LND-010 open: the 20 % wording stays until the product owner unifies «below market».

## Acceptance criteria

- Landing parity scenarios (KV-QA-013) pass or map to an LB/DEV: `owner-agent`, `{ru,uz,en}-desktop` (sections),
  `{ru,uz,en}-desktop-static`, `{ru,uz,en}-phone-static`.
- Savings: for a median of $600, cheap = $480 and the yearly number «$1 440»; district buttons in descending `n` order;
  no `pt:` code ever rendered.
- Counter: `day` 120 → «120 новых квартир за сутки»; `day` 80 and `week` 450 → «450 новых квартир за неделю»; both
  < 100 → hidden.
- Pushes: at most 4, oldest first, one per second at ≥ 35 % visibility; ages unchanged by the visitor's clock.
- The server HTML contains the FAQ questions and answers in the page's language.

## Tests

- Unit: `savings.ts` (round10, saving, ordering, fallback selection), `counter.ts` thresholds, push ordering and ages.
- E2E (`landing-sections.spec.ts`): the scenarios above; switch keyboard behaviour; reduced-motion run.
- `todo('DEV-039 PROPOSED')`.

## Edge cases

- Selected district without a median for the chosen rooms: the first entry is selected (BR-LND-008).
- `medians` empty (sale file or missing data): the block shows no district row (flag on) or the fallback (flag off).
- Uzbek date names in the lock-screen clock for every weekday and month.

## Security

SEC-REQ-021: data and catalogue texts rendered as text; rich text only `<br>` and `<b>`.

## Definition of done

`make ci-frontend` green; unit and E2E tests green; scenario results recorded for KV-QA-013; parity gate G4 for
F-LANDING-003 (live and savings part) and F-LANDING-004 (FAQ part) ticked (`15` §4); `09` rows updated; PR reviewed by
the other developer.
