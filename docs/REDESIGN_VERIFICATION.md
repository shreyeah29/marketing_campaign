# Redesign verification

Evidence log for Phase 6. Claims below are backed by greps, builds, or file paths
as of commit `659b4d5` (Phase 5 complete) and follow-ups.

## Phase 5 screen inventory

| # | Screen | Route | Commit / notes |
|---|--------|-------|----------------|
| 1 | Home | `/app` | `df2a457` |
| 2 | AI Command Center | `/app/create` | `229f347` (+ `?prompt=` in `659b4d5`) |
| 3 | Guided intake | `/app/create/intake/[draftId]` | `b3aeb2d` |
| 4 | Strategy review | `/app/create/strategy/[draftId]` | `6c2220f` |
| 5 | Review queue | `/app/campaigns/[id]/assets` | `0354550` |
| 6 | Calendar | `/app/calendar` + schedule tab | `6b79aa0` |
| 7 | Publish | modal on calendar | `6b79aa0` |
| 8 | Performance | `/app/campaigns/[id]/performance` | `659b4d5` |
| 9 | Leads | `/app/leads`, `/app/leads/pipeline` | `659b4d5` |
| 10 | Analytics | `/app/analytics/{overview,channels,audience,revenue}` | `659b4d5` |
| 11 | Connections | `/app/connections` | `659b4d5` |
| 12 | Campaign report | `/app/campaigns/[id]/report` | `659b4d5` |
| 13 | Auth shell | `/login` + siblings | `df2a457` |
| 14 | Onboarding | `/app/onboarding/[step]` | `659b4d5` |
| 15 | Generation | `/app/create/generating/[id]?phase=` | `659b4d5` |

Landing `/` restyled with Home in `df2a457`.

## Automated checks (re-run before alias deletion)

```bash
# Hand-rolled badge — expect empty
rg -n 'className="badge' apps/web/src

# Forbidden leftovers — expect no live usage (comment-only OK)
rg -n 'backdrop-filter|radius-pill|grad-text|glass-blur' apps/web/src

# Legacy alias consumers — must be 0 before deleting the alias block
rg -n 'var\(--bg\b|var\(--text-muted|var\(--text-dim|var\(--ok\b|var\(--danger\b|var\(--warn\b|var\(--info\b|var\(--color-primary|var\(--primary-soft|var\(--shadow\b' apps/web/src --glob '!**/globals.css'
```

### Results recorded

| Check | Result |
|-------|--------|
| `className="badge"` | **0 matches** |
| `backdrop-filter` / `radius-pill` / `glass-blur` | **0 live**; `grad-text` mentioned only in a retirement comment in `globals.css` |
| Legacy alias consumers | **~27 matches** outside `globals.css` — **alias block must not be deleted yet** |
| Hardcoded hex in TSX | Residual in marketing forms/pages editor, creative-library video bg, analytics campaigns gender fallback — not on Phase 5 primary spines; video bg in `asset-editor` moved to `var(--surface-inverse)` |
| `@vsp/web` typecheck / lint / build | Pass after `659b4d5` |

## Contract honesty (no mocks)

Where the frozen API has no campaign-scoped or feature endpoint, UI states are
labelled honestly:

- Performance Meta tiles: org-wide `/meta/analytics/*`
- Conversions / Revenue tiles: `—` when no field exists
- Pause control: disabled (no pause verb)
- Audience analytics: Meta demographics/geo or empty
- Google Ads / Analytics connection cards: unavailable
- Report revenue/Meta: org-wide, called out in copy
- Comments tab on assets: unavailable empty
- Lead activity/notes: unavailable empty
- Onboarding progress: `sessionStorage` only

## Manual checklist (owner / next session)

- [ ] Eleven statuses identical via `StatusPill` / `StatusRail` / `toStatus`
- [ ] Rule 1 — AI draft iris until approve
- [ ] Rule 3 — amber only for human decision (lead mid-score is **slate**)
- [ ] Creation spine: Create → intake → strategy → generate → review → schedule → publish → performance
- [ ] Morning loop: Home Zone B → review / connections
- [ ] Review queue J/K/A/R/Esc without mouse
- [ ] `⌘K` from shell
- [ ] `prefers-reduced-motion`, light/dark contrast
- [ ] 360px width, no horizontal page scroll

## Finish line

1. Migrate remaining `~27` legacy alias usages to brief tokens.
2. Delete the legacy alias block from `apps/web/src/app/globals.css`.
3. Re-run the greps above — all must be clean.
4. That deletion is the redesign’s real finish line.
