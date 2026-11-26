# Backend Audit Report

**Project:** `astrobackend` (Node.js / Express 5 / MongoDB / Mongoose)
**Date:** 2026-11-26
**Scope:** Full backend — routes, controllers, services, models/schemas/queries, auth/authorization, validation/error handling, business logic, third-party integrations (Razorpay, Cloudinary, Gemini/Groq/OpenRouter, LiveKit, Firebase), security, performance, and AI-output authenticity.
**Method:** Static code review, targeted runtime probes, live provider/model checks, real API end-to-end calls against the configured MongoDB, and the full automated test suite. Pre-existing uncommitted work in `config/db.js` (pool tuning) and `.DS_Store` was treated as user work and preserved.

---

## 1. Executive summary

| Area | Result |
|---|---|
| Automated tests | **276 / 276 passing** (baseline was 265) |
| Live end-to-end API/AI smoke test | **20 / 20 checks passing** |
| AI features reviewed | Palm, Face, Graphology, Logo, Astro-QA, Numerology, Vastu, Kundli, Human Design, Vedic compatibility |
| Issues fixed in this pass | 25 code files + 6 test files changed |
| Remaining items | Documented in §3 (open security concerns) and §6 (pending) — no feature was removed to achieve a fix |

The most important finding was that **Kundli chat could fabricate a reference chart (current date + Agra + noon), answer questions as if it were the user's chart, and return `verified: true`**, while AI failures were replaced with canned prose that was also labeled verified. This has been corrected: missing birth data now yields an explicitly unverified, non-chart-grounded answer or a 503; no chart fields are invented.

The reading/graphology/logo pipelines were verified with **live, input-specific model calls**: different handwriting samples and different logos (blue circle vs red square) produced different, image-grounded reviews; a blank handwriting image was correctly reported as having no visible handwriting rather than fabricated.

Financial and consultation flows contained several real correctness bugs (a schema field silently discarded, a no-answer sweep ending chat sessions, double-credit races, non-idempotent refunds/finalization). The high-confidence, low-risk portions are fixed; full MongoDB transaction wrapping remains a recommendation because it requires a replica-set deployment decision.

---

## 2. AI feature audit — input authenticity

### 2.1 Verified genuinely grounded (no change required)

| Feature | Evidence |
|---|---|
| **Palm / Face reading** (`/api/face-palm/*`, `/api/face-reading`, `/api/palm-reading`) | Uploaded images are checked for a non-empty buffer, a client-declared image MIME type, and a minimum size, then sent to Gemini vision. The prompt requires observations from the submitted image; `validateReadingImage` rejects invalid/empty uploads. Contract tests cover the shared pipeline; magic-byte sniffing remains an open hardening item (§3). |
| **Graphology** (`/api/graphology/*`) | Live sample of handwriting produced sample-specific comments; blank image produced “no visible text or handwriting” with no invented traits. Disclaimer and structured areas present. |
| **Logo analysis** (`/api/logo/analyze`) | Blue-circle and red-square logos produced distinct reviews with different scores (35 vs 25), grounded in the uploaded design. Prompt explicitly forbids generic output. |
| **Astro QA** (`/api/astro-qa`) | Question + optional saved chart + KB excerpts are inserted into the RAG prompt. If all providers fail, a 503 is returned and nothing is stored. No canned fallback. |
| **Numerology ask** (`/api/numerology/ask`) | Name/DOB-derived numbers and retrieved KB passages are sent to the model; charge is refunded on model failure; no answer is stored on failure. |
| **Vastu instant analysis** (`/api/vastu/analyze`) | Real floor-plan map + uploaded video URI sent to Gemini vision. Tolerant JSON parsing returns `score: null` and empty `doshas` on parse failure instead of inventing doshas (unit test confirms). |
| **Reviewed Vastu reports** | Deterministic rule engine (`data/vastuRules.json`) evaluated against submitted property inputs; missing/unverified fields are surfaced explicitly. Not LLM output, but genuinely input-derived. |
| **Vedic compatibility** | Computed from real charts; missing precision is recorded rather than guessed. |

Human Design is **not** included in the verified-clean list: it defaults a missing birth time to `12:00` and mixes UTC (service) with IST (controllers), so time-dependent activations can be arbitrary. See §2.3 and §6.2 item 7.

`Math.random()` appears only as retry jitter in LLM services and when generating mock payment IDs, never in answer generation. No random/predefined answer selection was found in the audited AI paths.

### 2.2 Fixed — fabricated or mislabeled AI output

| # | Issue | Root cause | Files | Fix |
|---|---|---|---|---|
| A1 | Hindi/Chinese reading reports could contain `interpretation: "Broad forehead in English"` while the localized `detailed` block was correct | `normalizeReport` overwrote localized `entry.interpretation` with raw model `point.detail` | `services/readingVisionService.js` | Localized structured notes win; raw detail is only used as a fallback. Regression test added. |
| A2 | `notes` and `focus` were mutually exclusive; focus was dropped whenever notes were supplied | Controller passed one combined string into `analyzeReading` | `controllers/readingController.js` | Both are passed as separate arguments. |
| A3 | Unknown `type` on the unified face/palm route silently ran **face** reading (e.g. `type: "graphology"`) | `pickController` fallback on unrecognized values | `routes/readingRoutes.js` | Returns `400 INVALID_READING_TYPE` ("Unknown reading type. Use 'face' or 'palm'."). Test added. |
| A4 | Structured reading areas lost `key`, `observation`, `interpretation` on DB round-trip | Mongoose strict schema omitted those fields | `models/readingReport.js` | Fields persisted; contract test added. |
| A5 | **Kundli chat fabricated a chart** when no birth details/saved horoscope existed (today's date, noon, Agra, IST 330) and presented its Lagna/Rashi as the user's | Unconditional "default reference chart" block | `controllers/kundliController.js` | Default chart removed. Without a real chart, answers are general, `verified: false`, `chartGrounded: false`, and contain no personal chart fields. On AI failure with no real chart the API returns 503 instead of canned prose. |
| A6 | **Canned fallback answers were labeled `verified: true` with hard-coded "sources"** | `generateGroundedCategoryInterpretation()` substituted on any AI failure; flags hard-coded | `controllers/kundliController.js` | Added `generationMode: "ai" \| "fallback"`, `verified` only for AI output checked against a real chart, `sources` only from actual model output. |
| A7 | Verification checked only the literal lowercase phrase `your Ascendant is`; Moon was ignored; `verified` always true | Single case-sensitive string comparison | `controllers/kundliController.js` | Case-insensitive Lagna **and** Moon checks; contradictions block `verified`. |
| A8 | **Kundli without birth time invented Aries (0°) Lagna** and generated houses/Chalit/Mangal Dosha from it | `calculateFullKundli` passed display default `"12:00"` and default Agra coordinates into `calculateVedicChart`, which read them as real data | `services/kundliCalculationService.js`, `controllers/kundliController.js` | Service now forwards `null` time/coords when the caller did not supply them (with explicit `timeProvided`/`locationProvided` overrides). Summary exposes `lagna: null`, `mangalDosh: null`, `ascendantAvailable: false`, `precision`, and the ephemeris note. Saved horoscopes no longer persist a fabricated time. Tests added. |
| A9 | Invalid non-empty birth time was normalized to noon internally but reported as `precision: "birth-time"` | Precision derived from raw truthiness | `services/astrologyService.js` | Precision derived from successful normalization; invalid input reports `date-only-estimate`. |
| A10 | HEIC logo uploads passed the filter then failed at the vision provider; empty buffers were accepted | MIME allowlist included unsupported formats; no buffer check | `middlewares/logoUpload.js`, `controllers/logoController.js` | Allowlist limited to JPEG/PNG/WebP; empty buffers return `400` with a clear message. |

### 2.3 AI items still open (see §6)

- Human Design silently defaults missing birth time to `12:00` and mixes UTC (service) with IST (controllers); full BodyGraphs can be arbitrary when inputs are incomplete.
- Kundli "Predictions and Remedies" mixes real placements with fixed generic nature/career/finance conclusions.
- Direct `GOOGLE_MODEL=gemini-3.5-flash` should be re-validated against current Google model availability (live calls currently succeed via routing). Re-pin to a supported model after compatibility testing.
- AI chat endpoints (`/api/kundli/chat`, `/api/health/ai`) are guest-accessible with only a generous global IP limiter — cost/abuse risk, not fabricated output.

---

## 3. Security fixes applied

| # | Issue | Root cause / impact | Files | Fix |
|---|---|---|---|---|
| S1 | Production CORS reflected any origin with `credentials: true`; Socket.IO reused it | Missing allowlist fell back to `origin: true`; any site could make authenticated (including admin) cross-site requests | `server.js` | Production fails closed: explicit `CLIENT_URL`/`CORS_ORIGINS` allowlist, otherwise `false` with a startup warning. Dev behavior unchanged. |
| S2 | Mock recharge could mint wallet balance in production if `.env.example` was copied | Guard was `NODE_ENV === "production" && ALLOW_MOCK_RECHARGE !== "true"`; example set it to `true` | `controllers/walletController.js`, `.env.example` | Mock recharge is now **always** blocked in production; example default is `false`. |
| S3 | Wallet credit check-then-write race could double-credit on concurrent verify + webhook | Balance incremented before unique transaction insert; loser still returned success | `controllers/walletController.js` | Atomic `$inc` upsert, duplicate ledger insert rolls the increment back, duplicate returns the existing transaction without crediting. |
| S4 | Webhook HMAC fell back to re-serialized JSON | Byte-level signature cannot be recomputed from parsed JSON; legitimate webhooks could be rejected | `controllers/walletController.js` | Require `req.rawBody`; reject with `400` when absent. |
| S5 | JWT verification did not pin an algorithm | Future algorithm-confusion hardening | `middlewares/authMiddleware.js` | `jwt.verify(..., { algorithms: ["HS256"] })` in both `protect` and `optionalProtect`. |
| S6 | Auth cache served stale `isActive`/`role` after admin changes or deletion | `invalidateAuthUser` was imported but never called (15s TTL) | `controllers/adminController.js`, `controllers/profileController.js` | Invalidation on status change, role change, admin delete, and self-delete. |
| S7 | FCM device tokens could be reassigned to another account and were echoed in full | Upsert keyed only on `{ token }`; raw tokens returned by user/admin/test endpoints | `controllers/notificationController.js`, `controllers/adminController.js` | Ownership conflict returns 409; upsert scoped to `{ user, token }`; tokens masked in register/list/test/admin responses. |
| S8 | Any user could delete another account's Cloudinary asset by putting its URL in their `photos` array | Deletion checked only `photos.includes(photo)` | `controllers/profileController.js` | Deletion allowed only for `res.cloudinary.com/astro/profile-photos/<callerId>/...` URLs. |
| S9 | Any astrologer could reassign a Vastu request via the admin-oriented assign route | Router admitted astrologers; controller had no admin check | `controllers/vastuReviewController.js` | `assignRequest` is admin-only; astrologers keep `claim` for self-assignment. |
| S10 | Non-string `email` caused 500 on register/login/admin-login | `.toLowerCase()` called before type validation | `controllers/authController.js`, `controllers/adminController.js` | Type checks return 400; registration also maps duplicate-key errors to 409. |
| S11 | Account deletion left recipient-side messages and sensitive reading images; claimed "all data deleted" | `Message.deleteMany({ sender })` only; media not always removed | `controllers/profileController.js`, `controllers/adminController.js` | Deletes messages where user is sender **or** recipient; reading media removed via `deleteReadingMedia` in both paths (with path-containment checks). |
| S12 | Reading photos persisted after failed multi-image uploads; local media never deleted on report deletion | `persistReadingImages` left earlier uploads; `deleteReadingMedia` only handled Cloudinary | `services/readingMediaService.js` | Partial batch uploads are rolled back; local files deleted with `/uploads/readings/` containment check; traversal outside the root refused. Tests added. |

### Security concerns still open

- **CSRF:** cookie auth uses `SameSite=None` in production with no CSRF token/double-submit cookie; `express.urlencoded` is global, so simple cross-site form POSTs can mutate state. Prefer Bearer-only mutations + custom header, or add CSRF tokens.
- **JWT revocation:** tokens are also returned in JSON bodies and remain valid for 7 days after logout; no `jti`/`tokenVersion`/denylist exists. Add short-lived access + refresh tokens and a server-side revocation check.
- **Live sockets:** deactivated users with an open Socket.IO connection keep sending events until disconnect; add a user→socket registry and disconnect on role/status changes.
- **Local upload serving:** `express.static("/uploads")` serves face/palm/handwriting/Vastu images without auth when Cloudinary is not configured. Serve via an ownership-checked controller or signed URLs in production.
- **AI cost abuse:** `/api/kundli/chat` and `/api/health/ai` are public; apply per-user/per-endpoint quotas and cache or protect provider health checks. Do not return raw provider error strings to guests.
- **Upload validation:** MIME types are client-declared. Add magic-byte sniffing and re-encoding; keep `nosniff` enabled.
- **Regex ReDoS/scan:** admin and Vastu searches pass user strings directly to `$regex`. Escape literals, cap length, add text indexes.
- **Operational:** `scripts/createAdmin.js` takes the password as a CLI argument; `scripts/fixWalletIndexes.js` can drop indexes without confirmation.

---

## 4. Business logic / billing fixes applied

| # | Issue | Root cause | Files | Fix |
|---|---|---|---|---|
| B1 | `callConnectedAt` was written but **stripped by Mongoose**, so every consultation looked unanswered; chat sessions were force-ended after 60s and ringing time was billed | Field absent from `consultationSchema` | `models/match.js`, `services/consultationBilling.js` | Field added; no-answer timeout restricted to `voice`/`video`. Schema + behavior tests added. |
| B2 | Finalization could skip or duplicate settlement side effects | `finalizeConsultation` marked status ended before settlement and aborted on `{ skipped: true }`; no persisted finalized marker | `services/consultationBilling.js`, `models/match.js` | Concurrent settles now wait and re-run; finalization serialized per match; persisted `finalizedAt` prevents repeat counters/emits. |
| B3 | No-answer refund was not idempotent and inflated lifetime earnings | Read-modify-write, no marker, `totalEarnings` never reversed | `services/consultationBilling.js`, `models/match.js` | `refundedAt` + ledger lookup guard; reverses `totalEarnings`; actual debit recorded; safe under repeated sweeps. |
| B4 | First-time wallet creation raced on the unique `user` index | Find-then-create | `services/consultationBilling.js`, `controllers/walletController.js` | On `E11000`, re-read the wallet instead of failing the billing tick/API. |
| B5 | Fractional recharge amounts charged rounded paise but credited sub-paise values | `Number(body.amount)` accepted any decimals | `controllers/walletController.js` | At most two decimals accepted; canonical amount derived from paise. |
| B6 | Consultation matches could be duplicated in reverse order | Unique index is directional; `requestConsultation` used requester-first | `controllers/consultationController.js` | Canonical ObjectId ordering, matching matchmaking. |
| B7 | REST text messages never emitted `chat:message` to open sockets | Only socket/sticker/media paths broadcast | `controllers/chatController.js` | REST path now broadcasts. |
| B8 | Failed chat media DB writes left orphaned Cloudinary assets | Upload happened before DB write; catch only called `next` | `controllers/chatController.js` | Uploaded `public_id` tracked and deleted on failure. |
| B9 | Incoming-call push failures could become unhandled rejections | Promise not caught | `services/chatSocketService.js` | `.catch()` with logging added. |
| B10 | Call invites could be sent into ended consultations by the non-paying participant | `getParticipantMatch` allows `ended`; invite only checked billing | `services/chatSocketService.js` | Ended consultation rejected in `call:invite`. |
| B11 | Profile `profilePhoto` was never persisted on create/generic update | In-memory assignment after `create`; update omitted the field | `controllers/profileController.js` | Persisted on create and whenever `photos` changes. |
| B12 | Vastu publish returned 409 for an invalid request state **after** persisting a published report | Validation ran after `report.save()` | `services/vastuWorkflowService.js` | Transition validated first; report save and request transition then proceed together. |

---

## 5. Performance / data model

**Fixed:** billing sweep now has a targeted compound index `{ matchType, status, "consultation.startedAt" }` and a deterministic oldest-first sort, so the 30-second sweep no longer scans the whole `matches` collection or starves old sessions (`models/match.js`, `services/consultationBilling.js`).

**Preserved:** the uncommitted connection-pool tuning in `config/db.js` (`maxPoolSize: 20`, `minPoolSize: 5`, `serverSelectionTimeoutMS: 5000`, `socketTimeoutMS: 45000`) is user work and was left untouched.

**Open performance items (§6):** unbounded queries in chat/admin/Kundli/notification paths, missing indexes on wallet-transaction `reason+createdAt`, device-token `user+isActive+updatedAt`, admin name/match sorts, and replacement of unanchored admin regex searches with text/Atlas Search.

---

## 6. Pending items (verified, not changed in this pass)

These are real issues that need either a product decision or a broader transactional/architectural change. They are deliberately left untouched to avoid unnecessary refactoring or API breakage.

### 6.1 Financial correctness / transactions (highest priority)

1. **No MongoDB transactions anywhere in the app.** A billable minute writes client wallet debit + ledger row, astrologer wallet credit + ledger row, profile earnings, free-usage, and the match `billedMin` watermark as independent operations (`services/consultationBilling.js`). A crash between steps can desynchronize money and ledger.
   - *Recommendation:* require a replica set, wrap settle/finalize/refund in `withTransaction()`, pass the session to every write. If transactions are not viable, implement a durable outbox with idempotency keys keyed by `matchId + billedMin + leg`.
2. **`finalizeConsultation` atomic claim across processes.** The persisted `finalizedAt` guard plus in-process map handles single-instance duplicates; two Node processes can still both read `status !== "ended"`.
   - *Recommendation:* `Match.findOneAndUpdate({ _id, status: { $in: ["accepted","active"] } }, { $set: { "status":"ended", "consultation.finalizedAt": now, ... } })` and only run side effects when it wins.
3. **Recharge ledger/order workflow is not transactional** (`creditWalletOnce` → `RechargeOrder.status = "paid"`). Straightforward double-credit is prevented by the unique `providerPaymentId`, but a crash can leave a balance without an order status update.
4. **Free-usage and wallet updates in settlement are read-modify-write keyed by match only.** Concurrent sessions for the same client/astrologer can lose debits/credits or grant the free window twice.
   - *Recommendation:* guarded `$inc` with predicates (`balance >= amount`, `$expr` on quota), mirroring `numeroBillingService`.
5. **Account deletion is split across two controllers** and still omits some collections (saved Kundlis/matches, numerology, logo designs/reviews, Vastu requests/reports, astrologer readings). Centralize into one deletion service with a retrying media-cleanup outbox.
6. **Numerology refund failures are swallowed** (`refundQuestion(...).catch(() => {})`) and a failed conversation write after charging leaves a paid question with no stored answer. Log refund failures and refund on persistence failure with an idempotent key.

### 6.2 AI / feature completeness

7. **Human Design** defaults missing time to `12:00` and mixes TZ 0 (service) with TZ 330 (controllers), producing plausible but arbitrary BodyGraphs and compatibility. Require time+timezone for full charts or return a partial chart with `approximate: true` and no time-dependent activations.
8. **Kundli predictions/remedies** contain fixed "balanced, intuitive and empathetic" / "steady resource accumulation" conclusions regardless of chart. Derive from real occupants/aspects/dignity or replace with neutral prompts.
9. **Vastu reviewed reports have no billing gate**; **reading billing service is unused** while reading controllers hardcode `isFree: true`. Confirm product intent: either wire the existing atomic billing services in, or remove the dead service and stop implying charges in responses/schema.
10. **Per-user/per-endpoint AI rate limits and quotas** are absent; add them before exposing `/api/kundli/chat` and `/api/health/ai` more widely.

### 6.3 Data model, concurrency, performance

11. `claimRequest` and Vastu template default switching are check-then-write races. Use conditional `findOneAndUpdate` and a partial unique index on `isDefault: true` (after cleaning existing duplicate defaults).
12. `generateReport` in `vastuWorkflowService` is find-then-create on a unique `request`; use an atomic upsert.
13. Unbounded queries: all chat matches, all recommendation profiles, astrologer queue, saved Kundlis, admin user detail (all matches/messages), reading reports during deletion, all active device tokens. Add pagination or cursor/batch processing.
14. Missing indexes: `{ reason: 1, createdAt: -1 }` on wallet transactions, `{ user: 1, isActive: 1, updatedAt: -1 }` on device tokens, name/search index for admin users, status/updatedAt for admin match lists.
15. `server.js` calls `connectDB()` without awaiting; make startup async and fail fatally before listening/starting the sweep.
16. Mongoose 9 deprecation: replace `new: true` with `returnDocument: "after"` across controllers/services.
17. Maintenance scripts need `--confirm`/environment guards and batched cursors; `createAdmin` should use an atomic upsert.

### 6.4 Environment / operational

18. `/api/health/ai` returns raw provider error strings to unauthenticated callers; return generic statuses and log details server-side.
19. Model configuration `gemini-3.5-flash` should be re-validated against current Google model availability; live calls currently succeed via routing, but pin a supported model after compatibility testing.
20. Existing duplicate Vastu default templates would make a partial unique index fail to build — audit production data before adding it.

---

## 7. Verification performed

### Automated tests
```
npm test
ℹ tests 276   ℹ pass 276   ℹ fail 0   ℹ skipped 0
```
Baseline before edits: 265/265. New/updated regression files:
- `test/aiAuthenticity.test.js` — no invented Aries Lagna; complete chart still has Lagna; invalid time not labeled birth-time.
- `test/matchConsultationSchema.test.js` — `callConnectedAt` survives Mongoose casting.
- `test/readingMediaService.test.js` — local media deletion, path containment, partial upload cleanup.
- `test/facePalmContract.test.js` — localized field persistence and invalid-type rejection.
- `test/readingVisionService.test.js` — localized notes are not overwritten.
- `test/consultationBilling.test.js` — chat sessions survive the no-answer timeout; refund lookup stub.

### Live AI checks
- `gemini-3.5-flash` and Groq `qwen/qwen3.8-27b` verified live; Groq model supports `["text", "image"]`.
- Graphology: handwriting sample → sample-specific observations; **blank image → "no visible text or handwriting"**, no fabricated traits.
- Logo: blue circle → review mentions the blue circle; red square → distinct image-specific review with a different score.
- Reading (unit regression): Hindi observation/interpretation fields survive normalization after the A1 fix.

### Live end-to-end API smoke (temporary user, cleaned up afterward)
```
20/20 checks passed
```
Covered: health; graphology analyze/list/detail/PDF/delete; logo analyze/list/latest; blank image handling; consent and upload-type validation; invalid reading type; non-string email; Kundli chat without chart (`verified:false`, `chartGrounded:false`, no Lagna leaked); Kundli calculate without time (`lagna:null`, `ascendantAvailable:false`).

---

## 8. Files changed

```
.env.example                         server.js
config/db.js (pre-existing user work — preserved)
controllers/adminController.js        controllers/authController.js
controllers/chatController.js         controllers/consultationController.js
controllers/kundliController.js       controllers/logoController.js
controllers/notificationController.js controllers/profileController.js
controllers/readingController.js      controllers/vastuReviewController.js
controllers/walletController.js       middlewares/authMiddleware.js
middlewares/logoUpload.js             models/match.js
models/readingReport.js               routes/readingRoutes.js
services/astrologyService.js          services/chatSocketService.js
services/consultationBilling.js       services/kundliCalculationService.js
services/readingMediaService.js       services/readingVisionService.js
services/vastuWorkflowService.js      test/* (6 files)
```

All changes are **uncommitted**; nothing was pushed.

---

## 9. Recommended order of next work

1. Decide replica-set/transaction strategy for consultation and recharge money movement (§6.1 items 1–4).
2. Add CSRF defense and JWT revocation; disconnect live sockets on role/status changes (§3 open items).
3. Centralize account deletion and add a media-cleanup outbox.
4. Gate/protect AI endpoints and sign or authenticate locally stored uploads.
5. Complete Human Design and Kundli prediction authenticity work (§6.2).
6. Add pagination, indexes, and safer admin search (§6.3).
7. Re-run `npm test` and the live smoke test after each batch.
