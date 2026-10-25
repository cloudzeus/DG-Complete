# P01 — Shell & IA του DG Complete

## Πλαίσιο
Διάβασε: `CLAUDE.md` (Κανόνες UI), `docs/09-ui-ux-dg-design.md`, `app/globals.css` (DG θέμα του dgsmartbi), `design/DG-README.md`. Φόρτωσε τα skills `dg-design-system`, `vengeance-ui` και (αν υπάρχουν) `frontend-design`, `ui-ux-pro-max`.

## Στόχος
Η περιοχή tenant `/t/[tenantId]` με το νέο menu και όλες τις σελίδες ως placeholders, πάνω στα components και το θέμα που ήδη έχει το dgsmartbi.

## Εργασίες
1. `lib/tenant.ts`: `requireTenant(tenantId)` στο pattern του `requireDashboardTenant` (user, tenant, access, membership role)· `tenantsOf(user)` για τον switcher.
2. `app/t/[tenantId]/layout.tsx` στο pattern του `app/dashboards/[tenantId]/layout.tsx`: `SidebarProvider` + νέο `TenantSidebar` (ομάδες ΕΠΙΣΚΟΠΗΣΗ / ΣΧΕΔΙΑΣΜΟΣ / ΕΚΤΕΛΕΣΗ / ΔΙΑΧΕΙΡΙΣΗ όπως docs/09 §2, items φιλτραρισμένα με `can()` και τις υπηρεσίες του πακέτου), acrylic header με όνομα tenant, badges «Προς ενέργεια» / «Εγκρίσεις», links προς `/admin` για staff.
3. Placeholder σελίδες για όλα τα routes του docs/09 §3 με το υπάρχον `PageHeader` και ένα `EmptyState`.
4. Redirect: `/` → `/t/<πρώτος tenant>` για χρήστες tenant, `/admin` για staff. Το `proxy.ts` matcher: `/admin`, `/t`.
5. Πρόσθεσε το registry `@vengeance` στο `components.json` και τα components που ταιριάζουν στο DG (π.χ. number ticker για KPIs, animated tabs) με wrappers στο `components/vengeance/`.
6. Νέα components στο `components/`: `StatusBadge` (πίνακας docs/09 §5), `KpiTile` (αν δεν αρκεί το `stat-card`), `EmptyState`, `CodeBlock`, `ConfirmDialog`, `JsonViewer`.
7. Motion: `lib/motion.ts` με GSAP presets (`fadeInUp` 240ms, `staggerList` 30ms) που σέβονται `prefers-reduced-motion`.
8. Όλα τα labels στα ελληνικά (το dgsmartbi δεν χρησιμοποιεί i18n library — κράτα το ίδιο, με σταθερές σε `lib/labels.ts`).

## Κριτήρια αποδοχής
- [ ] Πλοήγηση σε όλα τα routes· σωστό active item· items κρυμμένα για ρόλους χωρίς δικαίωμα.
- [ ] Χρήστης χωρίς membership στο `/t/<άλλος>` → 403 (`forbidden()`).
- [ ] Κανένα νέο hardcoded hex εκτός των tokens.
- [ ] Lighthouse accessibility ≥ 95 σε 2 σελίδες.

## Μην κάνεις
- Μην αλλάξεις το `app/globals.css` πέρα από προσθήκες. Μη βάλεις gradients/glow/emoji.
