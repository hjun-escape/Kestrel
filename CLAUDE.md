# Early Warning — team context for Claude Code

Hackathon build. Hacking ends 8:00 PM PT; submit before then. First working version by 3:00 PM (Sense Check block 2).

## What we're building
An app for bank credit officers. It watches the companies a bank has lent money to and flags public signs of trouble before they show up in quarterly financials (which arrive 45–90 days after quarter end). Theme: catch what humans miss.

Since 12:50 (Sense tester 1) we lead with screening a company before the bank lends (stage = applicant), and keep monitoring it after the loan (stage = borrower). Same checks, two moments. See docs/PLAN.md §0.

Target borrowers are mid-size PRIVATE companies: no analyst coverage, quarterly financials only. That is the whole point of the product.

## Stack
- Base44: app, screens, entities, backend functions. Code syncs 2-way with this GitHub repo through the main branch.
- Bright Data: all external data. The app's backend calls Bright Data's APIs directly. The Bright Data MCP is only for us while building.
- Sense AI (MCP): user testing. Only the Research owner launches checks.

## This repo and the Base44 app
- Repo: github.com/hjun-escape/early-warning (private). It replaced natephunt/TalkToUsersHackathonGroup17 at about 1:15 PM.
- Base44 app "Early Warning": id `6aca96c9744d6ba75bc4fabd`, live at https://early-warning-5bc4fabd.base44.app.
  - It opens without login for Sense testers. Anyone with the link can press Refresh or "Screen new applicant", and once sources are on, each press spends Bright Data credits.
- Layout:
  - entities: `base44/entities/*.jsonc`
  - backend functions: `base44/functions/<name>/entry.ts` (Deno, `export default async function(req)`). Import the SDK pinned like the existing functions: `npm:@base44/sdk@0.8.52`.
  - screens: `src/pages/`
  - signal type table: `src/lib/signalTypes.js`
  - placeholder data: `src/lib/seedData.js`
- Base44 tooling (CLI, local dev, SDK): see `AGENTS.md` and `README.md`.

## Team ownership (stay in your lane to avoid merge conflicts)
| Owner | Branch prefix | Owns |
|---|---|---|
| P1 App | `ui/` | Base44 screens, entities, Base44 settings and secrets, merging to main |
| P2 News data | `news/` | exec_departure and legal_layoffs signals (Bright Data SERP API), LLM tagging |
| P3 Jobs & reviews data | `jobs/` | hiring_drop and review_distress signals (job postings + Glassdoor), status scoring |
| P4 Research & pitch | `research/` | Sense checks, picking demo borrowers, feedback log, slides, demo script, QA |

Do not edit files owned by another role without asking in chat first.

## Data contract (do not change without telling the whole team)
Borrower:
- name, website_domain, hq_city, hq_state, industry
- stage: applicant | borrower (default borrower)
- loan_amount_usd (fictional; for applicants it is the requested amount), linkedin_url, glassdoor_url
- status: green | yellow | red. Only meaningful once last_refreshed is set. Before that it is a placeholder ("green"); screens show "Not checked", and exports or reports must too.
- why: one-line string
- last_refreshed: ISO timestamp, empty until the first refresh that actually checked something
- sources_unavailable: list of strings, only these values: News | Legal | Jobs | Reviews

Signal:
- borrower_id
- type: hiring_drop | review_distress | exec_departure | legal_layoffs
- severity: strong | weak
- date: YYYY-MM-DD
- title: short headline
- snippet: exact quote from the source, or a computed fact like "14 postings in last 30 days vs 37/month before"
- source_name, source_url

Every signal function is a Base44 backend function.
- Input: request body `{ borrower }`, where borrower is a full Borrower record (optional extras: `today`, `snapshot_id`).
- Output: a JSON list of Signal objects in this shape.
- On failure: a non-2xx response.
- It never writes status.

## Signal rules
1. hiring_drop: job postings dated in the last 30 days vs the prior 60 days (normalized per 30 days). Drop ≥50% = strong, 25–50% = weak. Skip (no signal) if the prior 60 days had 0 postings.
2. review_distress: Glassdoor. Any review in the last 90 days mentioning layoffs, furloughs, late or missed pay, or closing = strong. 90-day average rating ≥0.5 below the prior 12 months = weak.
3. exec_departure: Google News via Bright Data SERP API: `"<name>" (CEO OR CFO OR president OR founder) (resigns OR "steps down" OR departs)`, last 180 days. CEO/CFO = strong, other senior roles = weak.
4. legal_layoffs: Google News: `"<name>" (lawsuit OR sued OR lien OR "WARN notice" OR layoffs OR bankruptcy)`, last 180 days. WARN notice, bankruptcy, or a lender/supplier lawsuit = strong; others = weak.

## LLM use: tagging only
The LLM only tags a single review or article and returns JSON: relevant, same_company, signal_type, severity, snippet.
- The snippet must be copied exactly from the source, never written by the model.
- Use website_domain and hq_city to reject a different company with a similar name. If unsure, same_company = false.
- The LLM never decides a borrower's status.

## Status rules (plain code, owned by P3)
Count signals from the last 90 days only.
- RED: 2+ strong, or 1 strong + 2 weak
- YELLOW: 1 strong, or 2+ weak
- GREEN: otherwise

Build the "why" line from the rules, e.g. "Red: CFO departure (Sep 12) + job postings down 62% in 30 days."

## Refresh flow
refreshBorrower(borrower_id):
1. Runs the signal functions that are switched on: newsSignals (P2; exec_departure + legal_layoffs), hiringSignal and reviewSignals (P3).
2. Skips any source that fails or is switched off, and adds its name to sources_unavailable (exec_departure → News, legal_layoffs → Legal, hiring_drop → Jobs, review_distress → Reviews).
3. For each source that answers, replaces that source's Signals, saving after each one so the screen fills in. A failed source keeps its previous Signals, and its chip shows "Unavailable".
4. Calls scoreBorrower (P3) and saves status, why and last_refreshed. If no source answered, it keeps status, why and last_refreshed as they were and returns an error.

While every signal function is switched off (placeholder mode), Refresh only bumps last_refreshed on companies that were already checked. A company that was never checked gets "No data sources are connected yet."

Switches live in `base44/functions/refreshBorrower/entry.ts` (P1's file): `enabled` on each signal function's line, and `SCORING_ENABLED`.
- Scoring must be on before (or in the same merge as) the first signal function, or a newly screened applicant would show its placeholder Green.
- Flip your own line in your branch, together with the function it turns on. P1 merges.

Screens read stored data only. Only the Refresh button and "Screen new applicant" call Bright Data live, so the demo stays fast.

## Git rules
- `main` = what Base44 shows = the demo. Only merge code that runs. Merging to main syncs to Base44.
- Work on your own branch (`ui/...`, `news/...`, `jobs/...`, `research/...`). Pull main before you start.
- Small pull requests, merged at least every ~45 minutes. P1 merges.
- Base44 editor changes are committed to main automatically, so pull often.
- P1 publishes the version that is on main, from the Base44 dashboard or a Base44 MCP deploy of a checkpoint. Never run `base44 deploy` from a local clone: it ships your local tree and bypasses the git sync.
- Code freeze on main at 7:30 PM. After that, only demo-breaking fixes.

## Secrets
- Never commit API keys or the Sense AI token. Use `.env` (it's in .gitignore) locally.
- Store the Bright Data key as a Base44 secret for backend functions.

## Sense AI
NEVER launch a Sense check without an explicit "launch" from P4 in chat. Each launch uses 1 of our team's 3 checks.

## Style
The UI should look like a bank's internal tool: clean, serious, no emojis. Status uses color plus a text label, never color alone. Every signal shows a clickable source link.
