# User Feedback Log

> The judges score **"what you changed after testers spoke, and why."** Every quote that changes the build goes here,
> together with the change it caused. P4 (Research) owns this file; anyone can add to it.

## Sense check 1: Idea (12–1 PM)

**Tested:** "Lenders miss early signs of borrower trouble between reporting dates, and finding out late costs them real money."
**Theme:** Catch what humans miss · **Status:** in progress (1 of 3 calls in)

### Tester 1 (assumption held: unclear)
- They talked about **vetting a loan application**, not monitoring an existing borrower. The trouble surfaced through interviews and a required cash flow chart, before the loan was made.
- **Red flags:** loans at **many other banks**, plus **small, slightly late payments** to those lenders.
- They declined the loan, so there was no financial loss. Finding out late cost **time, not money**.
- After the decline, follow-up happened only through personal conversations, with no formal process.

> "It didn't cost me anything financially. It just cost me time."
>
> "Honestly, I wish I woulda asked the cash flow documents a lot earlier in the process."
>
> "But if I had an ability to use a tool that would pick up this stuff sooner in the process, that would be great."

### What it might change (pending testers 2–3)
| Observation | Possible change | Decision |
|---|---|---|
| Red flags appeared **before** the loan (underwriting) | Also pitch it as a pre-loan screen, not only for monitoring | **Adopted 12:50.** Added an Applicants tab + live "Screen new applicant", and we lead the pitch with it. Monitoring is kept as the Portfolio tab (see `docs/PLAN.md` §0) |
| "Loans at many other banks" (stacking) | Find the applicant's other lenders | **Built.** "Other lenders" check (public liens, lender lawsuits, judgments, loan news) and a cash-flow check that reads the applicant's own statement for every lender paid, late or missed payments and bounced payments (parsed in an isolated Daytona sandbox) |
| "Asked the cash flow documents a lot earlier" | Ask for documents at the start | **Built.** Auto-generated document request (13-week cash flow, debt schedule of all lenders, payoff letters) |
| Follow-up "only through personal conversations" | A formal decision record | **Built.** Decision log: request documents / decline / proceed / watchlist, with note, follow-up date and who decided |
| The cost was **time** | Lead with speed | **Adopted** in the pitch: screened in minutes, not weeks |

Check 1 closed with 1 of 3 testers.

## Sense check 2: What we built (3–4 PM)

**Tested (live app, kestrel-app.base44.app):** "Credit officers miss warning signs like loans at other banks and small late payments until late in vetting, and those late catches cost them bad loans or wasted work."
**Status:** in progress (1 of 2 calls in)

### Tester 1 (met theme: mixed)
Has never vetted a private company for a loan, so they couldn't name specific misses. Said the tool would not fit their own day-to-day.

**Liked:** the red/yellow/green read on likelihood to repay; seeing the company's business, industries and location; information from many sources to pressure-test what a company says.

**Disliked:** the page doesn't define red/yellow/green; AI answers can change with wording, so no full assurance; wants an audit trail before relying on an AI tool.

> "Any other place you can get information is always good… information from all different places. So it's an input."
>
> "I don't think it defines what yet red, yellow, and green are, although, uh, I think they're pretty obvious."
>
> "It cannot be used to fully rely on at this point in my opinion."
>
> "…coming up with a best in class… with an audit trail product."

### What we changed
| Tester said | Change | Status |
|---|---|---|
| Colors aren't defined | Status legend on the loan book and company page, plus a count line ("2 strong, 1 weak in the last 90 days → Red") | In progress |
| AI answers vary, so it can't be fully relied on | Say it on screen: "Status is set by fixed rules, not AI. The same evidence always gives the same status. Every quote is checked word for word against its source." | In progress |
| Wants an audit trail | Per-company audit trail (every check, signal, analysis, cash-flow review and decision, with who and when), exportable to CSV/PDF | In progress |

## Sense check 3: Our question (6–7 PM)
_TBD_
