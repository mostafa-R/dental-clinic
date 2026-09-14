# Dental OS — SaaS Platform (Site Admin Console) · UI/UX Design System & Screen Spec

**Version:** 1.0
**App:** `dashboard/` — the platform / super-admin console ("Site Dashboard").
**Companion app (out of scope here):** `dental os/` — the tenant clinic operating app.
**Status:** Code-grounded spec, current implementation. Extension points flagged for the PRD roadmap (H1–H3).

This document is the hand-off source of truth for building the SaaS console in Figma / any design tool. Every screen, component and token below reflects the real product surface (`dashboard/src`), including routes, permission gating, fields, states and the bilingual (en/ar, LTR/RTL) + light/dark theming.

---

## 1. Product context

Dental OS is a multi-tenant dental clinic SaaS. The **platform console** (`dashboard/`) is used by **site admins only** to operate the SaaS business:

| Concern | What lives here |
|---|---|
| Tenants | Create clinics, manage lifecycle (trial → active → suspended → cancelled/archived), delete, usage quotas, impersonation ("Login as clinic staff") |
| Branches | Cross-tenant branch registry (every tenant branch must be rooted at a tenant) |
| Plans & subscriptions | Pricing plans (price/interval/module limits/features), active subscriptions, manual payment processing |
| Analytics | Global SaaS KPIs: tenant growth, revenue growth, total patients/appointments, churn, MRR/ARR, ARPA |
| Admins | Platform users with role + permission matrix; one-time credentials display |
| Security/ops | Feature flags (per-tenant module enablement), quarantine, health, performance, audit logs, error logs, backups, platform settings |
| New-to-platform (roadmap H1) | Self-serve onboarding wizard, Stripe billing/dunning, read-only paywall states — see §7 |

### 1.1 Realms & roles (ground truth: `lib/permissions.js`, `lib/roles.js`)

Platform roles are `super_admin` (full access, bypasses every check), `admin` (limited), `support` (read-only).

| Nav / page | Route | super_admin | admin | support |
|---|---|---|---|---|
| Dashboard (Overview) | `/` | ✓ | ✓ | ✓ |
| Tenants | `/tenants` | ✓ | ✓ | ✓ |
| Branches | `/branches` | ✓ | ✓ | ✓ |
| Plans | `/plans` | ✓ | ✓ | ✓ |
| Billing | `/billing` | ✓ | ✓ | ✓ |
| Analytics | `/analytics` | ✓ | ✓ | ✓ |
| Admins | `/admins` | ✓ | ✓ | — |
| Audit Logs | `/audit-logs` | ✓ | ✓ | ✓ |
| Error Logs | `/error-logs` | ✓ | ✓ | — |
| Feature Flags | `/feature-flags` | ✓ | ✓ | — |
| Health | `/health` | ✓ | — | — |
| Quarantine | `/quarantine` | ✓ | ✓ | — |
| Backups | `/backups` | ✓ | ✓ | — |
| Performance | `/performance` | ✓ | ✓ | — |
| Settings | `/settings` | ✓ | ✓ | ✓ |

Action-level gating (used in the spec's component tables). `strict: true` = role-list only, no fallback.

| Access key | Allowed | UI behavior |
|---|---|---|
| `tenants.create` / `tenants.update` | super, admin | Show/allow Add / Edit |
| `tenants.suspend` / `tenants.activate` | super, admin | Contextual row action (only on Active / Suspended rows) |
| `tenants.archive` / `tenants.delete` | super only | Danger row actions |
| `tenants.usage` | all roles | Usage modal opens |
| `tenants.impersonate` | super, admin | "Login as" modal |
| `branches.create` / `branches.update` | super, admin | Add / Edit |
| `branches.delete` | super only | Danger delete |
| `billing.update` | super only | Edit subscription modal |
| `billing.payment` | super, admin | "Process payment" on past-due |
| `plans.create/update/delete` | super only | Add/Edit/Delete plan |
| `admins.create/update/delete` | super only | Add/Edit/Delete admin |
| `quarantine.set` / `quarantine.remove` | super only | Quarantine / Remove |
| `backups.trigger` | super only | Trigger backup |
| `performance.reset` | super only | Reset stats |
| `featureFlags.toggle` | super only | Enable/disable module (dimmed pill otherwise) |
| `settings.update` | super only | Save platform settings |

Design rule: **never rely on visibility alone for privilege** — destructive controls must be *hidden* (not just disabled) when the access key is denied. Where a page is entirely denied, sidebar item + route are hidden.

---

## 2. Design system

### 2.1 Principles

- **Desktop-first** operator tool (dense, keyboard-capable); degrades to tablet/wide mobile.
- **Bilingual symmetric:** fully mirrored LTR/RTL (`document.documentElement.dir`), every layout uses logical properties (the code uses `start`/`end`, `ms`/`ps`, `text-start`). Do not hard-flip; use logical LTR/RTL tokens.
- **Light + dark** as first-class, not afterthought. All tokens have both values.
- **Calm neutrals + one accent:** indigo is the single primary accent; emerald/amber/red/blue/purple are strictly semantic (success/warning/danger/info/metrics).
- **Status density:** tables + badges carry most information; color is always paired with a text label (never color-only).

### 2.2 Design tokens (map 1:1 to Figma Variables)

#### Color — primary & neutrals (current implementation is Tailwind; hexes given for Figma)

| Token | Light | Dark | Usage |
|---|---|---|---|
| `brand-500` | #6366F1 | #6366F1 | Focus rings, charts stroke/fill, toggles checked, active pagination |
| `brand-600` | #4F46E5 | — | Primary button bg (light) |
| `brand-700` | #4338CA | — | Primary button hover (light) |
| `brand-50` / `brand-900/50` | #EEF2FF / 50% #312E81 | — | Selected nav bg, stat icon chip, module tile selected |
| `surface-base` | #FFFFFF | #1E293B (slate-800) | Cards, table containers, topbar, sidebar |
| `surface-page` | #F8FAFC (slate-50) | #0F172A (slate-900) | App background |
| `surface-subtle` | #F1F5F9 (slate-100) | rgba slate-700 ~ #334155 | Inputs (secondary), hover rows, tag chips, avatar bg |
| `border-default` | #E2E8F0 (slate-200) | #334155 (slate-700) | Card/table/input borders |
| `text-primary` | #0F172A (slate-900) | #FFFFFF | Headings, table primary cells, stat values |
| `text-secondary` | #64748B (slate-500) | #94A3B8 (slate-400) | Labels, subtitles, muted table cells |
| `text-tertiary` | #94A3B8 (slate-400) | #64748B (slate-500) | Placeholders, group labels |

#### Color — semantic

| Token | Light | Dark | Usage |
|---|---|---|---|
| `success` (emerald) | #059669 / #10B981 | #34D399 | Active tenants, paid, healthy, routes <50ms, backup success |
| `warning` (amber) | #D97706 / #F59E0B | #FBBF24 | Suspended/trial, overdue, degradation, cache hit-rate |
| `danger` (red) | #DC2626 / #EF4444 | #F87171 | Suspended, errors, quarantine, delete, impersonation banner |
| `info` (blue) | #2563EB / #3B82F6 | #60A5FA | Trial, uptime, requests count |
| `accent-purple` | #7C3AED / #8B5CF6 | #A78BFA | Storage quota bars, purple metrics |
| `variant bg (light)` | 100-scale tint | 900/50 alpha | Badge/tile backgrounds (`emerald-100`, `red-900/50`…) |

Badge variant map (see §2.4 Badge) — identity per status:

| Status family | Variant |
|---|---|
| Active / running / connected / success | `success` (emerald) |
| Trial / in-progress / equipment connected / past-due-soft | `info` (blue) |
| Suspended / cancelled / warning / overdue / degraded | `warning` (amber) |
| Failure / errors / quarantined / disabled-2fa / delete | `danger` (red) |
| Archival / inactive / neutral | `default` (slate) |
| Plan / role primary accent | `primary` (indigo) |

#### Typography (Tailwind default scale — adapt to Figma text styles)

| Figma style | Size / weight / case | Usage |
|---|---|---|
| Display / stat value | 30px · 700 (text-3xl) | StatCard value, plan price 36px (text-4xl) |
| H2 page-embedded | 18px · 600 | Card titles (page H1 lives in Topbar) |
| H1 / Topbar title | 18px · 600 | Current section title |
| Body base | 14px · 400/500 | Tables, forms, descriptions |
| Label | 14px · 500 | Form field labels |
| Table header | 12px · 600 · uppercase · wider tracking | Table `thead` |
| Meta | 12px · 400 | Subtitles, timestamps, captions |
| Monospace | 12–14px · mono | Credentials, URLs, filenames, IPs, routes |

#### Spacing / shape

| Token | Value | Usage |
|---|---|---|
| Space grid | 4px (multiples) | All spacing |
| Page padding | 24px (`p-6`) | Content pages |
| Section gap | 24px (`gap-6`) | Card/stat grids |
| Shell height | 64px (`h-16`) | Sidebar brand row + Topbar |
| Corner: control | 8px (`rounded-lg`) | Buttons, inputs, selects, nav items |
| Corner: card/panel | 12px (`rounded-xl`) | Cards, modals, login card |
| Corner: pill | full (`rounded-full`) | Badges, feature chips, toggle |
| Border width | 1px (`border`) | Cards, inputs, tables |
| Input height | ~40px (`py-2` + text-sm) | Text/number/select |

#### Elevation

- Cards / panels: light `shadow-sm` + 1px border; dark border only (shadow negligible).
- Modals: overlay `#000/50`, panel `shadow-xl rounded-xl`.
- Sticky elements: Topbar/sidebar `border-bottom/right` only (no shadow drift).

### 2.3 Iconography

- Heroicons Outline set (the app bundles from `@heroicons/react/16`-style) — e.g. `BuildingOffice`, `Users`, `CreditCard`, `ChartBar`, `ShieldCheck`, `Cog`, `Heart`, `Clock`, `CheckCircle`, `ExclamationTriangle`, `ArrowUpTray`, `MagnifyingGlass`, `Plus`, `XMark`, `Bars3`, `Moon`, `Sun`, `ArrowRightOnRectangle`, `NoSymbol`, `Toggle`.
- Sizes: nav 20px, stat icon 24px in 48px chip, action buttons 16px, empty-state 48px.
- Stroke 1.5, currentColor. RTL: orientation-neutral icons only.

### 2.4 Component library (ground truth to `components/ui/*`)

#### Button
- Variants: `primary` (indigo), `secondary` (slate soft), `danger` (red), `ghost` (transparent, hover slate), `outline` (bordered).
- Sizes: `sm` 12px/8×6, `md` 14px/16×8, `lg` 16px/24×12.
- States: default, hover, focus (2px indigo ring + offset), disabled (50% opacity, not-allowed), loading (replaces icon with spinner).
- Usage: primary = main CTA; secondary = "Search"/"Cancel"; ghost = table row action links; danger = destructive; outline = pagination prev/next.

#### Badge
- Variants: `default, primary, success, warning, danger, info` (bg tint + colored text, `rounded-full`).
- Sizes: `sm`/`md`/`lg` (12px uppercase in tables is expressed as text, not badge).
- Usage: tenant/subscription/backup status, plan tags, role tags, action labels in audit/error logs.

#### Card
- `bg white / dark slate-800`, `rounded-xl`, `shadow-sm`, `border`, default padding 24px; `padding="p-0"` variant for table cards (card = surface, list = inner rows).
- Optional `relative` for overlays (plan "Inactive" badge).

#### StatCard
- Structure: label (14px secondary) / value (30px bold, text-primary) / optional change line (`↑` emerald or `↓` red, 14px) or subtitle (14px secondary) / right icon chip (48px indigo-50 tint, 24px indigo icon).
- Used for: all numeric KPI rows.

#### Input / Select / Checkbox
- Input & select: 1px border slate-300 (light) / slate-600 (dark), `rounded-lg`, `py-2`, bg surface, focus ring 2px indigo. Error state: red border + red helper text.
- Checkbox: indigo accent, `rounded`.
- Search input: leading position indicator icon (logo-neutral, `start`) + `ps-10`.

#### Toggle (Switch)
- Pill `w-10 h-5`, knob translates on state; checked = indigo bg / white knob; disabled state shown at 60% opacity when permission denied (still conveys state, blocks interaction).

#### PasswordInput
- Input with eye / eye-off toggle at inline-end; used in login, admin create, tenant admin-account field, 2FA flows reuse numeric token inputs.

#### Modal
- Overlay `#000/50`, panel `rounded-xl shadow-xl`, header title + XMark close, body `p-6`.
- Sizes: `sm` max-w-md (confirm/prompts), `md` max-w-lg (branch/usage), `lg` max-w-2xl (tenant/plan/admin forms), `xl` max-w-4xl (reserved).
- Text-only confirm pattern: title question, 1-line body, footer right-aligned [Cancel `secondary` | Destructive `danger`/`primary`].
- Content-rich pattern: multi-section form modal (see §3.5) with `SectionHeader` (icon + bottom border).

#### Table (de-facto standard, no component wrapper)
- Wrapper `overflow-x-auto`; header row `bg-slate-50 / dark:bg-slate-800/50`, 12px uppercase; body `divide-y`, rows `hover:bg-slate-50/dark:slate-700/50`; cells 16px vertical padding, `whitespace-nowrap`; numeric/actions right-aligned; monospace cell chips for method/IP/filename.
- Row actions: ghost `sm` text buttons in trailing column, color-coded (indigo=neutral edit, emerald=positive, amber="Login as", red=destructive).

#### Pagination
- Mobile: Previous/Next outline buttons. Desktop: "Page X of Y", first/last pinned with ellipsis, ±1 around current, active = indigo filled, disabled at bounds. Rendered only when `totalPages > 1`.

#### EmptyState
- Circular 48px icon chip, title, optional description (max-w-md centered), optional action slot.

#### Spinner / PageLoader
- Spinner: 2px border slate-300 with indigo top segment; sizes sm/md/lg/xl (16/24/32/48).
- PageLoader: centered `min-h-400px` xl spinner; used for every initial data load.

#### UsageQuotaBar
- Label + `used / limit` + optional unit; bar color indigo/emerald/blue/purple; ≥80% → amber, ≥100% → red with "limit reached"; bar hidden when limit effectively unlimited (0 or ≥999999); caption `"{remaining}% remaining"`.

#### Banner (ad-hoc pattern)
- Error: `bg-red-50 border-red-200` text red — top of page/section (e.g. Backups error, login 2FA failure, form server errors).
- Warning (profile 2FA disabled, maintenance mode): amber-tinted surface.
- Impersonation: full-width red-600 bar above Topbar, white text, white "Stop impersonation" button.

---

## 3. Screens

Framework for every screen: `PageLoader` → content; `EmptyState` when empty; `Pagination` when multi-page.

### 3.1 Auth — Login (`/login`)

Layout: centered, single card `max-w-md`, page bg. Brand lockup: 48px indigo tile "DO" + "Dental OS" H1 + "Site Dashboard" sub. Subfooter: "Site administrator access only".

Fields: email (placeholder `admin@dentalos.com`), password (PasswordInput, placeholder `••••••••`).
States: field validation errors, server error banner, submit `lg` full-width with loading.
Enter submits; no "remember me"; no public signup link (console-only).

### 3.2 Auth — 2FA challenge (`/login`, `requires2fa` state)

Same card shell. Title "Sign in to Dental OS" + subtitle "Two-factor authentication".
- Default: 6-digit numeric input, centered, `tracking-widest`, `text-lg`, numeric-only max 6, placeholder `000000`; full-width "Verify" (`loading`).
- Link "Use a backup code" toggles to `XXXX-XXXX` mono text input.
- Links back to credentials ("Cancel"). Error banner on wrong token.

Flow states (§6.1): login submit → server returns `requires2fa` + `challengeToken` + `challengeAdminId` → challenge UI → verify → redirect `/`.

### 3.3 App shell (all authed screens)

- **Sidebar** (`w-64`, collapsed `w-20`): brand row (indigo "DO" tile + "Dental OS"), nav grouped with uppercase group labels + divider between groups, active item = indigo-50 tint + indigo text, footer "Site Dashboard v1.0". Collapsed: icon-only, `title` tooltips. Nav groups: Dashboard / Management (Tenants, Branches, Plans) / Finance (Billing, Analytics) / Security (Admins, Feature Flags, Quarantine) / Monitoring (Health, Performance, Audit Logs, Error Logs) / System (Backups, Settings).
- **Topbar** (`h-16`): hamburger (collapse), current page title (18px 600), theme toggle (moon/sun), divider, user cluster (name + capitalized role sub), logout icon button (red hover). Sticky top.
- **Impersonation banner** (when active): red-600 full-width strip — "Impersonation warning: NAME (email) @ TENANT" + small description + white "Stop impersonation" button.
- **Content**: `bg-slate-50/dark:slate-900`, `p-6`.
- Shell special case: when permissions route-deny, `RequireAccess` renders access-denied state (empty state variant) rather than the page.

### 3.4 Dashboard `/` · Overview

4 StatCards: Total Tenants (+ "N this month" green ↑), Active Tenants (+ "% of total" sub), Monthly Recurring Revenue (currency, USD), Total Patients (across all tenants sub).
Two info cards:
- **Revenue Overview:** rows — Total Revenue / Monthly Recurring (emerald value) / Churn Rate % / ARPA (emerald) each in subtle row chip.
- **Platform Statistics:** Total Appointments / New Tenants This Month (indigo value) / Total Patients.

Uses dashed indigo chart accents only when extended with charts (see Analytics).

### 3.5 Tenants `/tenants` · Core screen

Toolbar: search input (Enter submits) + status `<select>` (All / Active / Trial / Suspended / Cancelled) + "Search" secondary + "Add Tenant" primary (gated `tenants.create`).

Table columns: Clinic Name (bold name + email sub), Plan (primary badge), Status (badge map: active→success, trial→info, suspended→danger, cancelled→warning, archived→default), Branches, Users, Created (date), Actions.

Row actions (ghost sm): **Usage** (indigo), **Login as** (amber, gated), **Edit** (gated), **Suspend** (red, only on Active) / **Activate** (emerald, only on Suspended), **Archive** (slate, gated super), **Delete** (red, gated super).

Modals:
- **Usage:** title "{tenant} — Usage Quotas", plan label; 4 UsageQuotaBars — Branches (indigo), Doctors (emerald), Patients (blue), Storage (purple, unit GB).
- **Login as:** title "Login as — {tenant}"; radio-list of tenant users (name / email • role), sorted list scroll `max-h-60`; [Cancel ghost | Login as primary, disabled until user selected]. On confirm: opens clinic app in new tab with `?impersonation=<token>`; red banner appears on every dashboard screen until ended.
- **Create/Edit Tenant** (`lg`): sections —
  1. *Basic Information*: Clinic name*, email* (regex), phone, plan* (options render `Name — $price/interval`; derives plan limits).
  2. *Status selector*: two selectable cards — Trial (amber, clock) / Active (emerald, check); selected = 2px colored border + tint.
  3. *Plan Details*: 4 stat tiles (Branches / Doctors / Patients / Storage; fallback "Unlimited").
  4. *Location* (collapsible): Address (span 2), City, Country.
  5. *Clinic Admin Account* (create only): PasswordInput, required ≥8.
  - Validation: inline red errors per field, top red banner for server errors. On success (create): transition to **credentials screen** — emerald box, email + password rows with Copy, `loginUrl` mono block, amber "shown once" warning; single "Done".
- **Confirm (suspend/activate/archive/delete)** `sm`: question title, 1-line body, [Cancel | destructive/primary].

Empty: BuildingOffice icon "No tenants found".

### 3.6 Branches `/branches`

Toolbar: search + tenant filter `<select>` ("All") + Search secondary + "Add Branch" primary (`branches.create`).
Table: Branch Name (name + phone sub), Tenant, Users, Address (truncated max-w-48), Status (Active success / Inactive default), Created, Actions (Edit / Delete red).
Modal (create/edit, `md`): tenant `<select>` (create only), name*, address, phone. Cancel/Submit `loading`. Delete → confirm `sm`.

### 3.7 Plans `/plans`

Header: "Subscription Plans" H2 + "Add Plan" primary (`plans.create`).
Card grid (3-col, cards relative): center — plan name 20px bold, price 36px bold + "/month|/year" secondary. Limit rows: Max Branches / Max Doctors / Max Patients / Storage / Support / Modules `N/12`. Features list (emerald check bullets) below a divider. Footer: Edit (`secondary`, flex-1) + Delete (ghost red). Inactive card corner "Inactive" warning badge.
Create/Edit modal (`lg`): Name*, Price + interval select, Branches/Doctors/Patients/Storage/Support inputs (0 = unlimited hint), **Modules** checkbox grid (12 modules: Dashboard, Patients, Appointments, Billing & Invoices, Accounting & Finance, Inventory, Medical Records (EMR), Prescriptions, Staff & Users, Branches, Settings, Roles & Permissions) — selected tile = indigo border/tint; **Features** tag adder (input + Add, Enter adds, X removes). "Active (available for new subscriptions)" switch. [Cancel | Save].
Delete confirm `sm` (name emphasized).

### 3.8 Billing `/billing`

4 StatCards: Total Revenue, Monthly Recurring (↑ from last month), Yearly Recurring, Pending Payments count.
Two cards:
- **Pending payments:** rows — tenant name + "Due: date" / amount bold + "overdue" warning badge; empty state "No pending payments".
- **Revenue by plan:** per plan dot (indigo) + plan label / revenue + "N tenants" sub.
Subscriptions table: Tenant (name), Plan, Status (badge: active→success, past_due→danger, else warning), Amount, Next payment date, Actions (Edit `billing.update`; **Process Payment** emerald when past_due, `billing.payment`).
Modals: **Edit** (`sm`, plan select, save), **Process Payment** (`sm`, amount* pre-filled, method select Cash/Card/Bank transfer, cancel/submit loading).

### 3.9 Analytics `/analytics`

Segmented period control: [30 days | 6 months | 12 months] (secondary buttons, active = primary sm).
Cards (2-col):
- **Tenant growth** — line chart, indigo stroke/fill, dashed grid, tooltip; data-points caption.
- **Revenue growth** — bar chart, indigo fill, radius 4 top, currency tooltip.
- **Statistics** — Total Patients / Total Appointments (2xl values in subtle rows).
- **Platform Overview** — 2×2 tinted metric tiles: Total Tenants (indigo), Active Tenants (emerald), New This Month (amber), Churn % (red).

(Extension — PRD §16 BI Suite: add chair utilization, doctor productivity, revenue by branch counters; per-tenant drill-down. Keep the same card/chart language.)

### 3.10 Admins `/admins` (super + admin only)

Toolbar: search + role filter (Super Admin / Admin / Support) + "Add Admin" primary (`admins.create`).
Table: Admin (48px avatar initial-indigo circle + name + email sub), Role (badge: super_admin→danger, admin→primary, support→info, uppercase · spaced), Permissions (chips of first 3 `perm.split(":")[0]` + "+N more"), Last Active, Actions (Edit / Delete red).
Create/Edit modal (`lg`): Name*, Email*, Password* (create; "leave blank to keep current" on edit), Role select (switches permission set), **Permissions** checkbox matrix (14 permission strings, scroll `max-h-48` in bordered box). On create success: **credentials modal** — emerald box, Email + Password mono rows each with Copy, "This password is shown only once" amber note, Done. Delete → confirm `sm`.

Permission strings to surface: `tenants:view/create/update/delete/suspend/activate`, `subscriptions:view/update/manage_payments`, `analytics:view/export`, `admins:view/create/update/delete`, `settings:view/update`, `plans:view/create/update/delete`.

### 3.11 Feature Flags `/feature-flags` (super + admin)

Flow: Tenant `<select>` (max-w-md) → module grid (3/4 col) with plan info badge + "N / 12 modules" counter. Each module tile: enabled = indigo border/tint with toggle pill; disabled = slate. Toggle interaction dimmed (60% opacity) when lacking `featureFlags.toggle`. Caption "Saving…" while toggling.
Module labels: Dashboard, Patients, Appointments, Billing, Accounting, EMR, Prescriptions, Users, Branches, Inventory, Roles, Settings.

### 3.12 Quarantine `/quarantine` (super + admin)

Header: "Check Abuse" primary (re-runs abuse checks).
Table: Name, Plan (`info` sm badge), Warnings (amber badges or —), Actions — **Quarantine Tenant** (danger, disabled when quarantined, `quarantine.set`) / **Remove Quarantine** (ghost emerald, disabled when not, `quarantine.remove`).
Set modal `sm`: confirm + reason input + [Cancel ghost | Quarantine danger]. Remove modal: [Cancel | Remove success]. Empty: "No abuse detected".

### 3.13 Health `/health` (super only) — auto-refresh 30s

4 StatCards: Uptime (info), MongoDB (connected→success / disconnected→danger), Node version, Platform.
Cards:
- **Redis:** status title suffix; 5 tiles — usedMemory, totalConnections, uptime (`Xd Xh Xm`), cacheHits, cacheMisses; hit-rate amber progress bar.
- **API Telemetry:** tile per endpoint with total + optional "{N} tenants".
- **Memory:** RSS (indigo), Heap Total (emerald, /512MB), Heap Used (sky) labeled bars with MB readouts.
PageLoader until first payload; cards render only when their payload exists.

### 3.14 Performance `/performance` (super + admin) — auto-refresh 15s

Header: "Refresh" ghost + "Reset Stats" danger (uses window.confirm, `performance.reset`).
4 StatCards: Total Requests (info), Total Routes, Avg Response Time (success if PRD target met else warning), Error Rate (danger if >0 else success).
3 mini status cards: PRD Target (met/not — emerald/amber dot), Routes <200ms (emerald, `X / total`), Routes ≥200ms (red).
Route table: Route (mono), Hits, Avg Ms (color: <50 emerald, <100 green, <200 yellow, <500 orange, ≥500 red), Min, Max, Errors (danger badge when >0), Error Rate.
Empty: "No performance data yet"; reset clears to that state.

### 3.15 Audit Logs `/audit-logs`

Toolbar: action `<select>` (All Actions + distinct action list). Table: Action (badge — contains delete/suspend→danger, create/activate→success, update/toggle→warning, else default), Admin (name + role sub), Target (type uppercase tiny + name/id), Date time, IP (mono). Pagination `pages > 1`.

### 3.16 Error Logs `/error-logs` (super + admin)

3 StatCards: Total (default), 4xx (warning), 5xx (danger).
Filters: tenant `<select>` (All Tenants) + status `<select>` (400/401/403/404/409/422/429/500), both reset to page 1.
Table: Date time, Status (badge: ≥500 danger, ≥400 warning, else default), Method (`<code>` chip), URL (mono truncated), Tenant Name, Message (truncated).

### 3.17 Backups `/backups` (super + admin)

Header: description + "Trigger Backup" primary (`backups.trigger`, ArrowUpTray icon, loading while triggering). Error banner when slice error.
Table: Date, Type (badge default; fallback "scheduled"), Status (success→success, failed→danger, running/in_progress→warning, else default), Filename (mono), Size, Duration.
Empty: large ArrowUpTray icon "No backups found". No pagination in current implementation. No restore UI (roadmap: add restore + retention UI).

### 3.18 Settings `/settings` — `max-w-4xl` stacked cards

1. **Profile:** avatar (initial), name, email, role (capitalized; super-admin slogan).
2. **2FA:** status + contextual note (super + enabled = "2FA is mandatory"; super + disabled = amber "Login blocked until 2FA enabled"). Buttons: Enable 2FA primary (loading) / Disable 2FA danger; super-admin cannot disable.
   - **Setup modal:** QR (from `otpauth`), secret mono, backup codes grid (2-col amber), 6-digit token input, error, full-width Verify.
   - **Disable modal:** 6-digit token, [Cancel ghost | Disable danger].
3. **Appearance:** theme tiles (Light / Dark, emoji, indigo ring active) + language select (English / العربية).
4. **Platform Settings** (save button gated `settings.update`): autoSuspendDays (number + "days"), trialDays (number + "days"), defaultPlan select (plans by key/name), emailNotifications toggle, maintenanceMode toggle inside a red-tinted box. (Slice also defaults `allowedDomains`, `maxTenants` — surface them with a clear "not yet edited" pattern.)

---

## 4. Information architecture & nav model

```
Site Dashboard
├─ Dashboard            (Overview)
├─ Management
│  ├─ Tenants           (lifecycle + usage + impersonation)
│  ├─ Branches          (cross-tenant registry)
│  └─ Plans             (pricing + limits + features)
├─ Finance
│  ├─ Billing           (subscriptions + payments + revenue)
│  └─ Analytics         (growth + KPIs)
├─ Security
│  ├─ Admins            (platform users + permissions)
│  ├─ Feature Flags     (per-tenant module enablement)
│  └─ Quarantine        (abuse management)
├─ Monitoring
│  ├─ Health            (services + memory + telemetry)
│  ├─ Performance       (per-route latency)
│  ├─ Audit Logs        (immutable trail)
│  └─ Error Logs        (4xx/5xx)
└─ System
   ├─ Backups           (scheduled + manual trigger)
   └─ Settings          (profile + 2FA + appearance + platform)
```

Nav rules:
- Groups and items are filtered by role at render time (group hidden entirely when empty).
- Every route is double-gated: sidebar filter + `RequireAccess` on the route.
- Titles: Topbar title resolves from current nav item via i18n.

---

## 5. UX flows & interaction rules

### 5.1 Sign-in with mandatory 2FA
email/password → server response `{ requires2fa }` → 2FA challenge (token or backup code) → `/`. Error paths: wrong credentials (red banner), wrong/expired token (red banner, back to login resets challenge).

### 5.2 Tenant lifecycle
Create (with admin account + credentials disclosure) → Trial (amber) / Active (emerald) → Suspend (danger, on Active only) → Activate (emerald, on Suspended only) → Archive (super, slate) → Delete (super, red, from confirm). Archive/delete are final states; delete requires typed confirmation in the spec (currently confirm modal — recommended hardening: type-to-confirm).

### 5.3 Impersonation
Tenants → Login as → pick tenant user radio → opens clinic app (`VITE_CLINIC_URL`) at `/login?impersonation=<token>` in a new tab → persistent red banner + "Stop impersonation" on every console screen → POST /impersonation/end clears banner. Impersonation sessions are PHI-masked and audit-logged (platform backend rules).

### 5.4 Quarantine
Quarantine (super) sets `isActive=false`, records reason → tenant cannot sign in; row shows quarantined state; Remove restores. Warnings originate from server abuse checks.

### 5.5 2FA setup / disable (self-service, super enforced)
Settings → Enable → QR + secret + backup codes shown once → verify 6-digit token → enabled. Disable requires current token. If super_admin without 2FA: amber block notice + only "Enable 2FA" path; login is blocked until enabled (server-enforced).

### 5.6 Failure messaging
- Initial load: PageLoader (spinner).
- Empty collections: EmptyState with contextual copy + primary action.
- Action failures: red banner at page/section top (Backups, forms, login).
- Destructive actions: always a confirm modal before execution.

---

## 6. States & edge cases (design checklist)

| Case | Treatment |
|---|---|
| Loading | PageLoader `min-h-[400px]`; inline "Saving…/Loading…" captions on small interactions |
| Empty list | EmptyState icon + title + description + optional CTA |
| No data subset (e.g. no pending payments) | Card-level centered muted text |
| Multi-page | Pagination only when >1 page; page reset on filter change |
| Permission denied | Control hidden (not disabled); route-level access-denied state |
| Past-due / at-risk | warning/danger badges on table rows; quota bars ≥80% amber, ≥100% red |
| Unlimited limit | Quota bar hidden, `${used} / ∞` representation |
| DB disconnected / error-rate spike | danger stat card + red badge |
| Dark mode & RTL | All tokens dual-valued; logical props; charts mirror on RTL axis |
| WCAG | Text/background AA on primary surfaces; focus-visible rings everywhere; labels bound to inputs |

---

## 7. Roadmap extension notes (design debt / next designs)

Align with the unified PRD (§13, §16, §20) so future screens keep the same system:
- **Signup / onboarding wizard (H1):** self-serve flow clinic data → branch → invite staff → first patient; add auth screen family (public signup, trial start) reusing the Login shell.
- **Stripe billing & dunning (H1):** subscription detail drawer, payment-failed states, upgrade/downgrade, invoice history.
- **Tenant cockpit (H1):** per-tenant usage + notifications for over-limit + module breakdown. The Usage modal is the seed component.
- **BI/reporting (H1–H2):** extend Analytics with the 13 dashboards from the API surface (overview/financial/inventory/patients/appointments/doctors/treatments/saas-billing/security/activity/usage/jobs/roles) reusing StatCard + chart cards.
- **Theme/branding, white-label (H3):** tokenize brand accent so tenant theming becomes a variable swap.

---

## 8. Figma/file hand-off cheatsheet

1. Create Figma Variables: `brand/neutrals/semantic` color tokens (both themes), text styles, spacing, radius, elevation (see §2.2).
2. Build the component plate: Button, Badge, Card, StatCard, Modal, Table, Pagination, Toggle, Input/Select/PasswordInput, UsageQuotaBar, EmptyState/PageLoader, Banner, Avatar — each with all variants/states.
3. Compose pages in order: Login + 2FA → Shell (Sidebar/Topbar/banner) → Dashboard → Tenants (+5 modals) → Branches → Plans → Billing → Analytics → Admins → Feature Flags → Quarantine → Health → Performance → Audit Logs → Error Logs → Backups → Settings (+2FA modal).
4. Provide one light frame set and one dark frame set; duplicate mirrored frame set for RTL.
5. Wire navigation with Figma interactive hotspots for the six flows in §5.