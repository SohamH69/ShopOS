# ShopOS UI kit

`import { Button, Card, … } from "../../components/ui";` (relative path; there are no aliases).
Everything is CSS Modules on the tokens in `src/styles/tokens.css`. Open **/kit** in `npm run dev` to see every component and state.

Conventions
- Icons: lucide-react. The kit sizes icons inside its components; elsewhere pass `size={16|18|20}`. Stroke width is 1.75 globally (override with `style={{ strokeWidth: 2 }}`, not the prop). Give decorative icons `aria-hidden="true"`.
- Global classes from `base.css`: `mono` (Spline Sans Mono + tabular figures: order numbers, SKUs, times), `num` (tabular figures in Mukta), `display` (condensed Anek Latin: titles and big numbers only), `muted` (ink-3), `truncate`, `visually-hidden`.
- Display face in your own CSS: `font-family: var(--font-display); font-stretch: var(--display-stretch); font-weight: 700;`.
- Colours only via tokens: `--paper --desk --desk-2 --ink --ink-2 --ink-3 --ink-4 --rule --rule-strong --rule-line --pen(-hover/-press/-tint/-tint-2) --margin(-text/-tint) --stamp(-tint) --haldi(-text/-tint) --leaf(-text/-tint)`. Radius `--radius-sm` 6 · `--radius` 10 · `--radius-lg` 14. Space `--space-1…16` (4px grid). Motion `--ease`, `--dur-1/2/3`. Layers `--z-sticky --z-nav --z-fab --z-overlay --z-popover --z-toast`.
- Single-column CSS grids: write `grid-template-columns: minmax(0, 1fr)` so long text or a wide SegmentedControl can't push the page wider than a phone.
- Forms: `Button` defaults to `type="button"`; use `type="submit"`. Put fields in `<Field>` — kit controls pick up the label, hint and error automatically.

## Actions

| Component | Props (besides native ones) | Notes |
|---|---|---|
| `Button` | `variant` primary · **secondary** · ghost · danger; `size` sm · **md** · lg; `icon`, `iconRight`, `loading`, `block` | 40px tall (36 sm, 48 lg; sm is 40 on touch). One primary per view. |
| `ButtonLink` | `to` (router) **or** `href` (+`newTab`); `variant`, `size`, `icon`, `iconRight`, `block`, `iconOnly`, `disabled`, `replace`, `state` | Looks like a Button. `iconOnly` needs `aria-label`. |
| `IconButton` | **`label`** (required, also the tooltip), **`icon`**, `variant` (**ghost**), `size`, `loading` | Square. |
| `buttonClassName(opts)` | `{ variant, size, block, iconOnly, className }` | Button classes for any element. |
| `Chip` | `selected?` (becomes a toggle with `aria-pressed`), `icon`, children | Quick picks: "In 1 hour", "Full ₹658". |
| `Menu` | **`items`**: `MenuEntry[]` (falsy skipped), **`label`**, `triggerText` (Button + chevron) or icon trigger (`triggerIcon`, default ⋯), `variant`, `size`, `align` start · **end**, `disabled`, `renderTrigger(props)` | Entries: `{ label, onSelect?, to?, href?, newTab?, icon?, tone?: "danger", disabled?, hint?, textValue? }`, `{ type: "separator" }`, `{ type: "label", label }`. Arrow keys, Home/End, type-ahead, Esc returns focus. |

## Form controls

| Component | Props | Notes |
|---|---|---|
| `Field` | **`label`**, `hint`, `error`, `optional`, `required` (aria only), `id`, `labelHidden`, `action` (right of label), children | Wires id / aria-describedby / aria-invalid into kit controls. Error replaces hint. |
| `Input` | `size` sm · md · lg, `invalid`, `leading`, `trailing`, `wrapperClassName` + all input props (`ref` works) | 16px text on phones (no iOS zoom). |
| `Textarea` | `invalid`, `rows` (3) | |
| `Select<T>` | `options: {value,label,disabled?}[]`, `value`, `placeholder` (first option, value ""), `onValueChange(value: T)`, `size`, `invalid` | Native select. |
| `Checkbox` | `label?`, `description?`, `checked`, `onCheckedChange(checked)`, `indeterminate`, `disabled` | Without label pass `aria-label`. 40px touch area. |
| `Switch` | same as Checkbox (no indeterminate) | `role="switch"`. |
| `MoneyInput` | **`value: number \| null`**, **`onChange(value \| null)`** + Input props | ₹ prefix, decimal keyboard, max 2 decimals, rounds to paise. |
| `QuantityInput` | **`value`**, **`onChange`**, `step` (1; use `unitStep(unit)`), `min` (0 — pass `step` for order lines), `max`, `unit`, `size` sm · md, `invalid`, `disabled`, `aria-label`, `inputRef`, `onKeyDown` | − / + stepper; ↑/↓ keys; 3 decimals. |
| `SearchInput` | **`value`**, **`onChange(text)`** + Input props | Clear button; Esc clears. Debounce yourself with `useDebouncedValue`. Outside a Field the placeholder is its label. |
| `SegmentedControl<T>` | **`options: {value,label,count?,disabled?}[]`**, **`value`**, **`onChange`**, `label` (aria; Field label used inside a Field), `size` sm · md, `block`, `disabled` | Radio group; arrows move. Scrolls sideways when too wide. |
| `Combobox<T>` | **`inputValue`**, **`onInputChange`**, **`options`**, **`getOptionKey`**, **`renderOption(option, {active})`**, **`onSelect`**, `leadingActions` / `trailingActions: {key,label,icon?,onSelect(query)}[]` ("create new" rows), `loading`, `emptyMessage`, `footer`, `placeholder`, `label`, `keepOpenOnSelect`, `openOnFocus` (true), `leading`, `inputRef`, `onKeyDown`, `size`, `disabled`, `invalid` | ARIA combobox; focus stays in the field. You filter/fetch options. |

Pickers (in `features/pickers/`):

| Component | Props | Notes |
|---|---|---|
| `CustomerPicker` | **`value: Customer \| null`**, **`onChange`**, `allowWalkIn`, `onWalkIn`, `allowCreate` (true), `autoFocus`, `placeholder`, `disabled`, `invalid`, `id`, `inputRef` | Recent customers before typing, server search after; phone + dues per row; inline "Add new customer" (name + phone, creates and selects). Chosen customer shows with **Change**. |
| `ProductPicker` | **`onSelect(product)`**, `onCustomItem(name)`, `price` **selling** · purchase, `inOrder: Record<productId, qty>`, `autoFocus`, `placeholder`, `disabled`, `invalid`, `id`, `inputRef`, `onKeyDown` | Instant client-side filtering (SKU exact → name start → word start → contains). Clears and stays open after each pick. Shows price and "12 kg in stock" / "Only 3 left" / "Out of stock". |

## Status and data display

| Component | Props | Notes |
|---|---|---|
| `Badge` | `tone` **neutral** · pen · margin · haldi · leaf · stamp, `size` sm · md, `icon`, `title` | `stamp` tone means paid only. |
| `OrderStatusBadge` | **`status`** | Dot + word. Cancelled is struck through. |
| `PaymentStatusBadge` | **`status`** | UNPAID / PARTIAL / PAID stamped mark. |
| `Stamp` | `label` **Paid** · Settled · Collected · Delivered, `size` sm · **md** · lg, `animate`, `className`, `style` | Signature. Only: landing demo, order becomes fully paid (animate), receipts (static), settled khata. Replay with a new `key`. |
| `Money` | **`value`** (null → "—"), `tone` default · muted · margin · leaf · pen, `exact`, `sign` auto · always (+/−) · never, `size` sm · md · lg, `display` | Mono, tabular. |
| `Avatar` | **`name`**, `size` sm · **md** · lg | Initials, stable tint, decorative. |
| `Kbd` | children | Use `modifierKeyLabel()` for Ctrl / ⌘. |
| `DescriptionList` | **`items: {label, value, key?}[]`**, `stacked` | Detail rows in drawers. |
| `StatStrip` | **`items: StatItem[]`** (`{ label, value, hint?, tone?, to?, key? }`), `loading`, `refreshing` | One card split by rules; 2 columns on phones. Pass formatted strings as `value` (e.g. `formatMoney(x)`). |
| `Trend` | **`current`**, **`previous`**, **`comparison`** ("yesterday"), `invert` | "↑ 12% vs yesterday" / "Same as yesterday". |
| `DataTable<T>` | **`columns: DataColumn<T>[]`**, **`rows`** (undefined = loading), **`rowKey`**, `onRowClick`, `rowActions(row)`, `isRowMuted`, `loading`, `refreshing`, `error` + `onRetry`, `empty`, `caption`, `layout` **auto** · table · cards, `framed` (true), `density`, `footer`, `skeletonRows` | Column: `{ key, header, cell(row, i), align?, width?, mobile?: "title" \| "aside" \| "meta" \| "hidden", mobileLabel?, headerHidden?, className? }`. Cards below 720px. Clicks on links/buttons in a row don't open it. Use `framed={false}` inside `<Card padding="none">`. |
| `LoadMore` | **`shown`**, **`total`**, **`hasMore`**, **`loading`**, **`onLoadMore`**, `noun` | Pair with `useInfiniteOrders` etc. |

## Charts (single series, hand-rolled SVG)

| Component | Props | Notes |
|---|---|---|
| `ColumnChart` | **`data: {label, value, secondary?, highlight?, key?}[]`**, **`label`** (summary + hidden table caption), `height` (160, plot only), `formatValue` (formatMoney), `formatAxis` (formatMoneyCompact), `showAxis`, `refreshing`, `periodLabel`, `valueLabel` | Today/latest `highlight` in pen, others pen-tint. Hover or focus + ←/→ shows a tooltip. |
| `BarList` | **`items: {label, value, displayValue?, hint?, to?, key?}[]`**, `formatValue`, `max`, `tone` **pen** · leaf · haldi · margin · ink, `limit`, `empty`, `label` | Ranked thin bars. |
| `Sparkline` | **`values`**, **`label`**, `width` 96, `height` 28, `tone`, `area` | |
| `StockMeter` | **`stock`**, **`min`**, `unit`, `label`, `width` 64 | ok (leaf) / low ≤ min (haldi) / out ≤ 0 (margin). `stockLevel(stock, min)` helper. |

## Layout and feedback

| Component | Props | Notes |
|---|---|---|
| `PageHeader` | **`title`**, `description`, `actions`, `back: {to, label}`, children (e.g. filters) | Display-face title (32 / 24 on phones). |
| `Card` | `title`, `description`, `actions`, `footer`, `padding` **md** · none, `as`, `headingLevel` 2 · 3, `className`, `bodyClassName`, `id` | Paper + 1px rule, no shadow. |
| `EmptyState` | **`title`**, `description`, `action`, `icon`, `compact` | Invite the next action. |
| `ErrorState` | `title` ("This didn't load"), `error` (shows its message), `description`, `onRetry`, `retrying`, `compact` | |
| `Skeleton` / `SkeletonText` | `width`, `height`, `radius` / `lines` | Pulse; static with reduced motion. |
| `Spinner` | `size` 16, `label` (announced) | |
| `Toast` | `ToastProvider` (mounted in App); `const toast = useToast()` → `toast.success / error / info(message, { description?, action?, secondaryAction?, duration? })` → id; `toast.dismiss(id)` | Action: `{ label, onClick? , href?, newTab? }`. Reuse the button's verb ("Payment recorded"). |

## Overlays

| Component | Props | Notes |
|---|---|---|
| `Modal` | **`open`**, **`onClose`**, **`title`**, `description`, children, `footer`, `size` sm · **md** · lg, `placement` **center** · bottom, `initialFocusRef`, `closeOnBackdrop` (true), `hideClose`, `onSubmit` (wraps body + footer in a `<form noValidate>`), `className` | Portal, focus trap, Esc, focus restore, scroll lock, app root inert. Bottom sheet on phones. |
| `Drawer` | **`open`**, **`onClose`**, **`title`** (node ok), `description`, `headerActions`, children, `footer`, `width` (520), `initialFocusRef`, `onSubmit`, `className`, `bodyClassName` | Right sheet; full screen below 640px. |
| `ConfirmDialog` | **`open`**, **`onClose`**, **`onConfirm`**, **`title`**, **`confirmLabel`**, `description`, `cancelLabel` ("Keep it"), `tone` **danger** · primary, `loading`, `error` (e.g. the 409 message), children | Focus starts on the safe button. |
| `Portal`, `isAnyOverlayOpen()` | | For custom overlays / pausing single-key shortcuts. |

Esc order: an open combobox list, menu or non-empty search box handles Esc first (they call `preventDefault`), then the top-most overlay closes.
