# Redesign verification

Evidence log for Phase 6 finish line. Claims below are backed by greps, builds,
or file paths.

## Phase inventory (0–6)

| Phase            | Status   | Notes                                       |
| ---------------- | -------- | ------------------------------------------- |
| 0 Docs           | Done     | `DESIGN_BRIEF`, `API_CONTRACT`, `CLAUDE.md` |
| 1 Audit          | Done     | `UI_AUDIT.md`                               |
| 2 Tokens         | Done     | Brief tokens + fonts; aliases later deleted |
| 3 Primitives     | Done     | `StatusPill` / `StatusRail` / kit / motion  |
| 4 Shell + routes | Done     | App shell IA, `/app` prefix                 |
| 5 Screens        | Done     | See inventory below                         |
| 6 Verification   | **Done** | Legacy alias block deleted; greps clean     |

## Phase 5 screen inventory

| #   | Screen           | Route                                                 | Notes                                 |
| --- | ---------------- | ----------------------------------------------------- | ------------------------------------- |
| 1   | Home / Dashboard | `/app`, `/app/dashboard`                              |                                       |
| 2   | Create (wizard)  | `/app/create` → `/app/create/wizard/[draftId]`        | Prompt → platforms → media → audience |
| 3   | Guided intake    | `/app/create/intake/[draftId]`                        | Legacy path still resumes             |
| 4   | Strategy review  | `/app/create/strategy/[draftId]`                      | Channel glimpses                      |
| 5   | Review queue     | `/app/campaigns/[id]/assets`                          | Post previews + concept → Runway      |
| 6   | Calendar         | `/app/calendar` + schedule tab                        |                                       |
| 7   | Publish          | modal on calendar                                     |                                       |
| 8   | Performance      | `/app/campaigns/[id]/performance`                     |                                       |
| 9   | Leads            | `/app/leads`, `/app/leads/pipeline`                   |                                       |
| 10  | Analytics        | `/app/analytics/{overview,channels,audience,revenue}` |                                       |
| 11  | Connections      | `/app/connections`                                    |                                       |
| 12  | Campaign report  | `/app/campaigns/[id]/report`                          |                                       |
| 13  | Auth shell       | `/login` + siblings                                   |                                       |
| 14  | Onboarding       | `/app/onboarding/[step]`                              |                                       |
| 15  | Generation       | `/app/create/generating/[id]?phase=`                  |                                       |
| —   | Landing          | `/`                                                   | Motion stage                          |

## Automated checks (finish line)

```bash
rg -n 'className="badge' apps/web/src
rg -n 'backdrop-filter|radius-pill|grad-text|glass-blur' apps/web/src
rg -n 'var\(--bg\b|var\(--text-muted|var\(--text-dim|var\(--ok\b|var\(--danger\b|var\(--warn\b|var\(--info\b|var\(--color-primary|var\(--primary-soft|var\(--shadow\b' apps/web/src
```

### Results

| Check                                            | Result                                                |
| ------------------------------------------------ | ----------------------------------------------------- |
| `className="badge"`                              | **0 matches**                                         |
| `backdrop-filter` / `radius-pill` / `glass-blur` | **0 live**; `grad-text` comment-only in `globals.css` |
| Legacy alias consumers                           | **0 matches**                                         |
| Legacy alias block in `globals.css`              | **Deleted**                                           |
| `@vsp/web` typecheck / lint / build              | Run at Phase 6 close                                  |

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

## Manual checklist (owner)

- [ ] Eleven statuses identical via `StatusPill` / `StatusRail` / `toStatus`
- [ ] Rule 1 — AI draft iris until approve
- [ ] Rule 3 — amber only for human decision (lead mid-score is **slate**)
- [ ] Creation spine: Create → wizard → strategy → generate → review → schedule → publish → performance
- [ ] Morning loop: Home Zone B → review / connections
- [ ] Review queue J/K/A/R/Esc without mouse
- [ ] `⌘K` from shell
- [ ] `prefers-reduced-motion`, light/dark contrast
- [ ] 360px width, no horizontal page scroll

## Finish line

1. ~~Migrate remaining legacy alias usages to brief tokens.~~
2. ~~Delete the legacy alias block from `apps/web/src/app/globals.css`.~~
3. ~~Re-run the greps above — all clean.~~
4. Redesign token finish line is complete: every value resolves from brief tokens.
