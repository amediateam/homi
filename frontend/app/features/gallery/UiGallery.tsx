"use client";

import {
  ArrowDown,
  ArrowUpDown,
  BottomSheet,
  Button,
  Check,
  ChevronLeft,
  ChevronRight,
  ChoiceList,
  CloudOff,
  EmptyState,
  ErrorState,
  FilterChip,
  Globe,
  HeaderChip,
  Heart,
  Lasso,
  LassoSelect,
  List,
  LocateFixed,
  Lock,
  type LucideIcon,
  MapIcon,
  MapPin,
  Megaphone,
  Plus,
  RadarIcon,
  RotateCw,
  Search,
  SegmentedControl,
  Settings,
  SlidersHorizontal,
  SubPageFrame,
  Trash,
  WifiOff,
  X,
} from "@homi/ui";
import { useLayoutEffect, useRef, useState } from "react";

import { Link } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { devFlags } from "@/lib/flags";
import { routes } from "@/lib/navigation/routes";
import { confirmText } from "@/lib/ui/confirm";
import { failed, saved } from "@/lib/ui/feedback";
import { showToast } from "@/lib/ui/toast";

import { CardStates } from "./CardStates";
import { Entry } from "./Entry";

/** The gallery's replacement toast follows the first one after this long, while the first is still shown. */
const REPLACEMENT_MS = 1500;

/**
 * The gallery of the `@homi/ui` primitives of WP-23 (D-E-4): one entry per primitive with a stable `data-testid`,
 * for review on a device and for the end-to-end specs (`crash.spec.ts`, `errors.spec.ts` of WP-32). The toast,
 * confirm and feedback entries drive the app's own helpers (`lib/ui`, shown by the `ToastHost` of the root layout);
 * the routes entry opens the real addresses whose wrappers are `RouteSheet`, `SubPage` and `RouteOverlay`; the card
 * entry shows the listing card's states with fixture data (`CardStates`, WP-24).
 * Development only, so its texts are literals, not catalogue keys; `app/[locale]/dev/ui/page.tsx` guards it.
 */
export function UiGallery() {
  const [sheet, setSheet] = useState<"full" | "compact" | "fixed" | null>(null);
  const [stacked, setStacked] = useState(false);
  const [subPage, setSubPage] = useState(false);
  const [crash, setCrash] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const record = (event: string) => setEvents((list) => [event, ...list].slice(0, 4));
  const closeSheet = () => {
    setStacked(false);
    setSheet(null);
  };

  // A hidden route keeps its state (cacheComponents): close the layers when it is hidden, so none is open on return.
  useLayoutEffect(
    () => () => {
      setSheet(null);
      setStacked(false);
      setSubPage(false);
    },
    [],
  );

  return (
    <main
      data-route="dev/ui"
      className="mx-auto flex w-full max-w-(--feed-max) flex-col gap-8 px-(--gutter) pt-[calc(16px+var(--top-inset))] pb-[calc(32px+var(--bottom-inset))]"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold">UI</h1>
        <p className="text-[13px] text-hint">Примитивы @homi/ui (WP-23). Только для разработки.</p>
      </header>

      <HeaderChips />
      <FilterChips />
      <SegmentedControls />
      <Choices />
      <ErrorStates />
      <EmptyStates />
      <CardStates />
      <Icons />
      <Toasts onEvent={record} />
      <Confirm onEvent={record} events={events} />
      <Feedback onEvent={record} />

      <Entry id="bottom-sheet" title="BottomSheet">
        <div className="flex flex-wrap gap-2">
          <Button size="md" data-testid="gallery-open-sheet-full" onClick={() => setSheet("full")}>
            Полный
          </Button>
          <Button size="md" variant="secondary" data-testid="gallery-open-sheet-compact" onClick={() => setSheet("compact")}>
            Компактный
          </Button>
          <Button size="md" variant="secondary" data-testid="gallery-open-sheet-fixed" onClick={() => setSheet("fixed")}>
            Без закрытия
          </Button>
        </div>
        <EventLog testId="gallery-sheet-events" events={events} />
      </Entry>

      <Entry id="subpage" title="SubPageFrame">
        <Button size="md" variant="secondary" data-testid="gallery-open-subpage" onClick={() => setSubPage(true)}>
          Открыть подстраницу
        </Button>
      </Entry>

      <RouteLinks />

      <Entry id="crash" title="Ошибка рендера">
        <p className="text-[13px] text-hint">Дочерний компонент бросает исключение при рендере: экран сбоя сегмента.</p>
        <Button size="md" variant="danger" data-testid="gallery-throw" onClick={() => setCrash(true)}>
          Бросить ошибку
        </Button>
        {crash ? <RenderCrash /> : null}
      </Entry>

      <BottomSheet
        open={sheet === "full"}
        onClose={closeSheet}
        variant="full"
        title="Фильтры"
        closeLabel="Закрыть"
        header={
          <Button variant="text" size="sm" onClick={() => record("reset")}>
            Сбросить
          </Button>
        }
        footer={
          <Button className="w-full" onClick={closeSheet}>
            Показать 128 объявлений
          </Button>
        }
        onDragStart={() => record("drag start")}
        onDragCommit={() => record("drag commit")}
      >
        <div data-scroll-x="" className="flex gap-2 overflow-x-auto px-(--gutter) py-1">
          {DISTRICTS.map((district) => (
            <FilterChip key={district}>{district}</FilterChip>
          ))}
        </div>
        <div className="px-(--gutter) py-3">
          <Button size="md" variant="secondary" data-testid="gallery-open-sheet-stacked" onClick={() => setStacked(true)}>
            Второй лист поверх
          </Button>
        </div>
        <Rows count={30} label="Строка фильтров" />
      </BottomSheet>

      <BottomSheet
        open={sheet === "full" && stacked}
        onClose={() => setStacked(false)}
        stacked
        title="Город"
        closeLabel="Закрыть"
      >
        <CityChoice onPick={() => setStacked(false)} />
      </BottomSheet>

      <BottomSheet
        open={sheet === "compact"}
        onClose={closeSheet}
        title="Сортировка"
        closeLabel="Закрыть"
        onDragStart={() => record("drag start")}
        onDragCommit={() => record("drag commit")}
      >
        <ChoiceList
          aria-label="Сортировка"
          options={SORTS}
          value="new"
          onValueChange={(value) => {
            record(`sort ${value}`);
            closeSheet();
          }}
        />
      </BottomSheet>

      <BottomSheet open={sheet === "fixed"} onClose={closeSheet} dismissible={false} title="Выберите город">
        <p className="px-(--gutter) pb-2 text-[13px] text-hint">Фон, Escape и жест не закрывают этот лист: только выбор.</p>
        <CityChoice onPick={closeSheet} />
      </BottomSheet>

      {subPage ? (
        <SubPageFrame
          data-testid="gallery-subpage-layer"
          title="Тема"
          back={
            <Button variant="ghost" size="icon" aria-label="Назад" onClick={() => setSubPage(false)}>
              <ChevronLeft aria-hidden />
            </Button>
          }
          hint="Свайп вправо закрывает подстраницу; на Android приложение его выключает."
          onBack={() => setSubPage(false)}
          onSwipeStart={() => record("swipe start")}
          onSwipeCommit={() => record("swipe commit")}
        >
          <Rows count={40} label="Длинное содержимое" />
        </SubPageFrame>
      ) : null}
    </main>
  );
}

function HeaderChips() {
  const [highlighted, setHighlighted] = useState(true);
  return (
    <Entry id="header-chip" title="HeaderChip">
      <div className="flex flex-wrap items-center gap-2">
        <HeaderChip data-testid="gallery-header-chip-plain" icon={<ArrowUpDown size={16} aria-hidden />}>
          Сначала новые
        </HeaderChip>
        <HeaderChip
          data-testid="gallery-header-chip-highlighted"
          highlighted={highlighted}
          onClick={() => setHighlighted((value) => !value)}
        >
          2–3 комнаты
        </HeaderChip>
        <HeaderChip
          data-testid="gallery-header-chip-badge"
          count={3}
          icon={<SlidersHorizontal size={16} aria-hidden />}
          aria-label="Фильтры, выбрано 3"
        >
          Фильтры
        </HeaderChip>
        <HeaderChip highlighted count={2} icon={<SlidersHorizontal size={16} aria-hidden />} aria-label="Фильтры, выбрано 2">
          Фильтры
        </HeaderChip>
      </div>
      <div className="w-[200px]">
        <HeaderChip data-testid="gallery-header-chip-long" icon={<MapPin size={16} aria-hidden />}>
          Юнусабадский, Мирзо-Улугбекский и Яккасарайский районы
        </HeaderChip>
      </div>
    </Entry>
  );
}

function FilterChips() {
  const [types, setTypes] = useState<string[]>(["apartment"]);
  return (
    <Entry id="filter-chip" title="FilterChip">
      <div className="flex flex-wrap gap-2">
        {TYPES.map((type) => (
          <FilterChip
            key={type.value}
            data-testid={`gallery-filter-chip-${type.value}`}
            pressed={types.includes(type.value)}
            onClick={() =>
              setTypes((list) => (list.includes(type.value) ? list.filter((value) => value !== type.value) : [...list, type.value]))
            }
          >
            {type.label}
          </FilterChip>
        ))}
      </div>
    </Entry>
  );
}

function SegmentedControls() {
  const [deal, setDeal] = useState<"rent" | "sale">("rent");
  const [period, setPeriod] = useState<"rent" | "daily" | "sale">("rent");
  const [mapDeal, setMapDeal] = useState<"rent" | "sale">("sale");
  return (
    <Entry id="segmented" title="SegmentedControl">
      <SegmentedControl
        data-testid="gallery-segmented-two"
        aria-label="Сделка"
        options={[
          { value: "rent", label: "Аренда" },
          { value: "sale", label: "Продажа" },
        ]}
        value={deal}
        onValueChange={setDeal}
      />
      <SegmentedControl
        data-testid="gallery-segmented-three"
        aria-label="Срок"
        options={[
          { value: "rent", label: "Аренда" },
          { value: "daily", label: "Посуточно" },
          { value: "sale", label: "Продажа" },
        ]}
        value={period}
        onValueChange={setPeriod}
      />
      <div className="rounded-large bg-bg2 p-4">
        <SegmentedControl
          data-testid="gallery-segmented-compact"
          aria-label="Сделка на карте"
          size="compact"
          options={[
            { value: "rent", label: "Аренда" },
            { value: "sale", label: "Продажа" },
          ]}
          value={mapDeal}
          onValueChange={setMapDeal}
        />
      </div>
    </Entry>
  );
}

function Choices() {
  const [language, setLanguage] = useState<string | null>(null);
  return (
    <Entry id="choice-list" title="ChoiceList">
      <div className="overflow-hidden rounded-medium bg-fill">
        <ChoiceList
          data-testid="gallery-choice-list-languages"
          aria-label="Язык"
          options={LANGUAGES}
          value={language}
          onValueChange={setLanguage}
        />
      </div>
      <p className="text-[13px] text-hint" data-testid="gallery-choice-list-value">
        Выбрано: {language ?? "ничего"}
      </p>
    </Entry>
  );
}

function ErrorStates() {
  const [retries, setRetries] = useState(0);
  const retry = () => setRetries((count) => count + 1);
  return (
    <Entry id="error-state" title="ErrorState">
      <div className="overflow-hidden rounded-medium bg-fill">
        <ErrorState
          data-testid="gallery-error-offline"
          kind="offline"
          title="Нет связи"
          text="Проверьте интернет и попробуйте ещё раз."
          retryLabel="Повторить"
          onRetry={retry}
        />
      </div>
      <div className="overflow-hidden rounded-medium bg-fill">
        <ErrorState
          data-testid="gallery-error-server"
          kind="server"
          title="Не загрузилось"
          text="Сервер не ответил. Попробуйте ещё раз через минуту."
          retryLabel="Повторить"
          onRetry={retry}
        />
      </div>
      <p className="text-[13px] text-hint" data-testid="gallery-error-retries">
        Повторов: {retries}
      </p>
    </Entry>
  );
}

function EmptyStates() {
  return (
    <Entry id="empty-state" title="EmptyState">
      <div className="overflow-hidden rounded-medium bg-fill">
        <EmptyState
          data-testid="gallery-empty-image"
          image={brand.assets.emptyShrug}
          title="Ничего не нашлось"
          hint="Попробуйте смягчить фильтры."
          action={
            <Button size="md" variant="secondary">
              Сбросить фильтры
            </Button>
          }
        />
      </div>
      <div className="overflow-hidden rounded-medium bg-fill">
        <EmptyState data-testid="gallery-empty-no-image" title="Здесь пока пусто" hint="Без картинки рамка 120 px остаётся." />
      </div>
    </Entry>
  );
}

function Icons() {
  return (
    <Entry id="icons" title="RadarIcon и иконки">
      <div className="flex items-end gap-4 text-text">
        <RadarIcon data-testid="gallery-radar-icon" size={24} />
        <RadarIcon size={32} strokeWidth={1.75} />
        <span className="text-accent">
          <RadarIcon size={40} />
        </span>
      </div>
      <ul className="grid grid-cols-4 gap-3 text-[11px] text-hint">
        {ICONS.map(([name, Icon]) => (
          <li key={name} className="flex flex-col items-center gap-1">
            <Icon size={24} className="text-text" aria-hidden />
            {name}
          </li>
        ))}
      </ul>
    </Entry>
  );
}

function Toasts({ onEvent }: { onEvent: (event: string) => void }) {
  const replacement = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // A hidden page keeps its state but runs its cleanups: the pending replacement goes with it.
  useLayoutEffect(() => () => clearTimeout(replacement.current), []);

  const showWithReplacement = () => {
    clearTimeout(replacement.current);
    showToast("Первый тост: через полторы секунды его заменит второй");
    replacement.current = setTimeout(() => showToast("Второй тост заменил первый и отсчитывает свои 4 секунды"), REPLACEMENT_MS);
  };

  return (
    <Entry id="toast" title="Toast">
      <p className="text-[13px] text-hint">Простой тост уходит через 4 с или по тапу, с действием — через 6 с или после кнопки.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="md" variant="secondary" data-testid="gallery-toast-plain" onClick={() => showToast("Ссылка скопирована")}>
          Простой
        </Button>
        <Button
          size="md"
          variant="secondary"
          data-testid="gallery-toast-action"
          onClick={() => showToast({ text: "Объявление скрыто", action: "Вернуть", run: () => onEvent("toast action") })}
        >
          С действием
        </Button>
        <Button
          size="md"
          variant="secondary"
          data-testid="gallery-toast-key"
          onClick={() => showToast({ key: "toast.blocked", values: { label: "@realtor_uz" } })}
        >
          Ключ каталога
        </Button>
        <Button size="md" variant="secondary" data-testid="gallery-toast-replace" onClick={showWithReplacement}>
          Замена
        </Button>
      </div>
    </Entry>
  );
}

function Confirm({ onEvent, events }: { onEvent: (event: string) => void; events: string[] }) {
  return (
    <Entry id="confirm" title="confirmText">
      <p className="text-[13px] text-hint">Нативный диалог Telegram с версии 6.2, вне Telegram — браузерный.</p>
      <Button
        size="md"
        variant="secondary"
        data-testid="gallery-confirm-ask"
        onClick={() => confirmText("Очистить историю просмотров?").then((answer) => onEvent(`confirm ${String(answer)}`))}
      >
        Спросить
      </Button>
      <EventLog testId="gallery-confirm-events" events={events} />
    </Entry>
  );
}

function Feedback({ onEvent }: { onEvent: (event: string) => void }) {
  return (
    <Entry id="feedback" title="failed() и saved()">
      <p className="text-[13px] text-hint">Вибрация Telegram; с DEV-016 failed() добавляет тост «Не получилось сохранить».</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="md"
          variant="secondary"
          data-testid="gallery-feedback-failed"
          onClick={() => {
            failed();
            onEvent("failed");
          }}
        >
          failed()
        </Button>
        <Button
          size="md"
          variant="secondary"
          data-testid="gallery-feedback-failed-dev016"
          onClick={() => {
            failed({ flags: { ...devFlags, dev016ErrorToastOnFailure: true } });
            onEvent("failed, DEV-016");
          }}
        >
          failed() с DEV-016
        </Button>
        <Button
          size="md"
          variant="secondary"
          data-testid="gallery-feedback-saved"
          onClick={() => {
            saved();
            onEvent("saved");
          }}
        >
          saved()
        </Button>
      </div>
    </Entry>
  );
}

/** The real addresses of the three wrappers, through the counted `Link`, so that Telegram's BackButton shows. */
function RouteLinks() {
  return (
    <Entry id="routes" title="RouteSheet, SubPage, RouteOverlay">
      <p className="text-[13px] text-hint">
        Настоящие адреса: BackButton Telegram закрывает каждый слой. Адрес, открытый напрямую, показывает отдельное
        представление — без тапа по фону и без жеста.
      </p>
      <ul className="flex flex-col overflow-hidden rounded-medium bg-fill">
        {ROUTE_LINKS.map((link) => (
          <li key={link.id} className="border-b-[0.5px] border-sep last:border-b-0">
            <Link href={link.href} data-testid={`gallery-route-${link.id}`} className="flex flex-col gap-0.5 px-4 py-3">
              <span className="text-[15px] font-medium">{link.title}</span>
              <span className="text-[13px] text-hint">{link.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Entry>
  );
}

function CityChoice({ onPick }: { onPick: () => void }) {
  const [city, setCity] = useState<string | null>(null);
  return (
    <ChoiceList
      aria-label="Город"
      options={CITIES}
      value={city}
      onValueChange={(value) => {
        setCity(value);
        onPick();
      }}
    />
  );
}

function Rows({ count, label }: { count: number; label: string }) {
  return (
    <ol className="flex flex-col">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="border-b-[0.5px] border-sep px-(--gutter) py-3 last:border-b-0">
          {label} {index + 1}
        </li>
      ))}
    </ol>
  );
}

function EventLog({ testId, events }: { testId: string; events: string[] }) {
  return (
    <p className="text-[13px] text-hint" data-testid={testId}>
      События: {events.length > 0 ? events.join(" · ") : "нет"}
    </p>
  );
}

/** Throws while rendering, for the crash screen of the segment (`crash.spec.ts`). */
function RenderCrash(): never {
  throw new Error("UI gallery: a render error on purpose");
}

const TYPES = [
  { value: "apartment", label: "Квартира" },
  { value: "house", label: "Дом" },
  { value: "room", label: "Комната" },
  { value: "commercial", label: "Коммерческая недвижимость с отдельным входом" },
];

const DISTRICTS = ["Юнусабад", "Мирзо-Улугбек", "Яккасарай", "Чиланзар", "Шайхантахур", "Сергели", "Алмазар", "Учтепа"];

const SORTS = [
  { value: "new", label: "Сначала новые" },
  { value: "cheap", label: "Сначала дешёвые" },
  { value: "expensive", label: "Сначала дорогие" },
];

const LANGUAGES = [
  { value: "ru", label: "Русский" },
  { value: "uz", label: "Oʻzbekcha" },
  { value: "en", label: "English" },
];

const CITIES = [
  { value: "tashkent", label: "Ташкент" },
  { value: "tashkent_region", label: "Ташкентская область" },
  { value: "andijan", label: "Андижан" },
];

const ROUTE_LINKS = [
  {
    id: "filters",
    href: routes.filters(),
    title: "RouteSheet · фильтры",
    hint: "Лист поверх страницы: ×, тап по фону, жест вниз за шапку, Escape и Back.",
  },
  {
    id: "settings-theme",
    href: routes.settingsPage("theme"),
    title: "SubPage · тема",
    hint: "Подстраница: Back и свайп вправо на сенсорном экране; на Android свайпа нет.",
  },
  {
    id: "listing",
    href: routes.listing(42),
    title: "RouteOverlay · объявление 42",
    hint: "Слой объявления: закрывается Back; свайп назад включает WP-26.",
  },
];

const ICONS: [string, LucideIcon][] = [
  ["Search", Search],
  ["Heart", Heart],
  ["Settings", Settings],
  ["Lock", Lock],
  ["Globe", Globe],
  ["Check", Check],
  ["X", X],
  ["Plus", Plus],
  ["MapIcon", MapIcon],
  ["MapPin", MapPin],
  ["List", List],
  ["SlidersHorizontal", SlidersHorizontal],
  ["ArrowUpDown", ArrowUpDown],
  ["Lasso", Lasso],
  ["LassoSelect", LassoSelect],
  ["LocateFixed", LocateFixed],
  ["WifiOff", WifiOff],
  ["CloudOff", CloudOff],
  ["RotateCw", RotateCw],
  ["Megaphone", Megaphone],
  ["ChevronLeft", ChevronLeft],
  ["ChevronRight", ChevronRight],
  ["ArrowDown", ArrowDown],
  ["Trash", Trash],
  ["RadarIcon", RadarIcon],
];
