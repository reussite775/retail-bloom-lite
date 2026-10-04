<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Multi-user shops: data rows are owned by the shop (owner's user id); employees map to a shop via `shop_members`, and RLS/RPCs resolve it with `current_shop()` / `is_shop_admin()` — never `auth.uid()` directly for shop data. Why: lets cashiers work on the owner's data with restricted rights.
- Employee accounts are created/deleted only via owner-verified server functions in `src/lib/team.functions.ts` using the admin client. Why: auth admin API is server-only.
- PWA: vite-plugin-pwa generateSW writes `sw.js` into `dist/client` (outDir/globDirectory) and is registered only via `src/lib/pwa.ts` (never in dev/preview/iframe). Why: SSR build has no index.html and preview must never be cached.
- Offline: React Query cache persisted to localStorage; cash-register sales made offline are queued in `src/lib/offline.ts` and replayed through the same RPCs when back online. Why: no lost sales on unstable networks.
- Platform super admin: role in `user_roles` (checked via `has_role`); all cross-shop reads/writes go through role-verified server functions in `src/lib/superadmin.functions.ts`. Subscription revenue = sum of `subscription_payments`. Why: merchants must never see each other's data.
- Shops are `organizations` (id = owner user id) with `organization_members` for roles; business rows reference the org via `user_id`/`organization_id` and RLS uses `current_shop()` (NULL when suspended). Why: strict tenant isolation without breaking existing columns.
- Platform admin lives under `/admin/*`, every action via has_role-checked server functions (`superadmin.functions.ts`, `relances.functions.ts`). Why: admin access never decided client-side.
- AI follow-ups call the Lovable AI Gateway Responses API server-side with streaming, parsed into JSON. Why: keep the key server-only.
- Subscription payments: `payment_checkouts` rows created by `startCheckout` (price computed server-side); activation only via service-role `mark_checkout_paid` RPC, called by the signed Bkapay webhook (`/api/public/bkapay/webhook`) or admin `validateCheckout`. Why: one idempotent activation path for automatic and manual validation.
- Merchant AI advisor: streaming server route `/api/assistant` (AI SDK Responses via Lovable AI Gateway) authenticates the caller's bearer token, checks shop admin + Premium, builds a data summary under RLS, and persists UIMessages in `assistant_messages` (one conversation per user). Why: data stays tenant-scoped and the key server-only.
