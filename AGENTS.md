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
