# YARN TRADE — CODEX MASTER / LIVING PROJECT REFERENCE

**Version:** 1.0  
**Date:** 2026-10-04  
**Status:** ACTIVE MASTER DOCUMENT  
**Target location:** repository root  
**Authority:** This file is the operational source of truth for Codex while implementing Yarn Trade.  
**Project type:** Focused yarn-trading business application — **NOT an ERP**.  
**Architecture target:** Modular Monolith, ASP.NET Core + React + SQL Server, one application / one primary database.

---

## 0. Mandatory Codex protocol

Codex MUST read this file before making architectural, database, security, workflow, posting, costing, inventory, partner-account, permission, or deployment changes.

### 0.1 Living-document rule
This document is not a static specification. It must evolve with the codebase.

For every accepted change that affects any of the following, update this file in the **same work package / commit**:

- architecture or module boundaries;
- business rules or workflow/status transitions;
- database schema, indexes, constraints, migrations, or data ownership;
- security, authentication, authorization, data-scope rules, secrets, deployment, backup, or audit;
- posting/reversal behavior;
- inventory/FIFO/costing;
- partner capital, partner claims, FX, exchange-house wallet, or remittance;
- APIs or shared contracts;
- roadmap status, deferred items, or owner decisions.

Do not mark a work package complete until:
1. code/migration is complete;
2. relevant automated/manual tests pass;
3. this document is updated;
4. the Change Log is updated;
5. unresolved decisions are recorded instead of silently guessed.

### 0.2 Scope discipline
- Do **not** rewrite the project from scratch.
- Do **not** introduce microservices, message brokers, CQRS frameworks, event-sourcing frameworks, generic repository layers, or other infrastructure unless a concrete approved requirement requires them.
- Prefer small, explicit services and EF Core transactions.
- Reuse existing code where sound.
- Remove/replace existing behavior only when this document explicitly calls for it.
- One work package at a time.
- No unrelated refactor in a work package.
- Future requirements may influence schema seams, but must not be fully implemented early.

### 0.3 Decision discipline
Where this document says **OWNER DECISION REQUIRED**, Codex must stop before implementing the affected business rule. It may prepare analysis/migration options, but must not invent the business answer.

### 0.4 Git save — HARD / NON-NEGOTIABLE PROJECT RULE
For every completed and accepted task, Git save is a mandatory final step. Never consider the task finished until the finalized, in-scope changes are safely recorded in Git.

Required final sequence:
1. Check `git status`.
2. Ensure only files related to the completed task are included.
3. Commit the finalized work with a clear commit message.
4. Push the commit to the appropriate remote branch.
5. Verify that the push succeeded.
6. Confirm whether the working tree is clean.
7. Report the branch, commit SHA, commit message, push result, and working-tree status.

Never leave accepted/final work only in the local working tree. Do not include unrelated changes in the commit, and do not merge to `master` unless explicitly instructed. If commit or push cannot be completed, report the reason clearly. This rule applies permanently to all future work packages.

---

# 1. Product goal and boundaries

Yarn Trade manages the end-to-end operating cycle of a yarn trading business with an Iranian company, Chinese partner/suppliers, warehouses, sales centers, customers, checks, partner settlements, exchange houses, and management analytics.

The intended lifecycle is:

**Master Data → Purchase Order → Proforma → China Loading/Shipment → Container/In-Transit → Warehouse Receipt → Landed Cost/FIFO → Sale → Receipt/Check → Partner Claim → IRR→USD Conversion → Remittance → Insight/Replenishment**

The application deliberately does **not** implement a full general ledger. It maintains operational sub-ledgers and produces accounting/export outputs where required.

---

# 2. Final module map

## M1 — Master Data & Shared Foundation
Responsibilities:
- products/SKUs and hierarchical product groups;
- persons/companies: customers, suppliers, Chinese partner, sales centers, exchange houses;
- warehouses, units, currencies, bilingual static data;
- users, roles, permissions, data scopes;
- settings and effective-dated/versioned parameters;
- audit, approvals, notifications, attachments/comments;
- shared import/export infrastructure.

## M2 — Procurement & Shipping
Responsibilities:
- purchase orders; one PO belongs to one supplier;
- proforma and supplier price history;
- Chinese partner English loading workbench;
- partial shipments;
- shipment/BOL/container/container-line model;
- packing list, invoice, images, ETA, customs/shipping documents;
- in-transit state;
- receipt discrepancy and return/exception feedback.

## M3 — Inventory & Costing
Responsibilities:
- append-oriented inventory movement ledger;
- origin/source lot lineage;
- warehouse inventory layers;
- warehouse-specific FIFO;
- sale cost allocations;
- two-step warehouse transfers through transit state/location;
- physical returns, adjustments, discrepancies;
- landed-cost file: provisional → finalized → manager-authorized reopen;
- future package/barcode extension seam, not full implementation now.

## M4 — Sales
Responsibilities:
- price lists and hierarchical group pricing;
- cash/credit pricing;
- provisional-price outbound workflow;
- warehouse release / final invoice;
- stock/clearance classification;
- financial return linked to physical return;
- contract version snapshot on sale;
- sales-center/customer privacy rules.

## M5 — Receivables & Checks
Responsibilities:
- cash/check receipts;
- allocation to invoices, oldest-first default;
- check lifecycle and custody history;
- bounced checks;
- customer credit control;
- sales-center operational account;
- commissions, offsets, recourse;
- late charge calculations.

## M6 — Partner & FX
Responsibilities:
- effective-dated partner contract;
- partner capital view for unsold inventory;
- partner claims for sold inventory;
- claim maturity/payability;
- exchange-house IRR/USD wallets;
- actual USD purchase transactions;
- allocation of USD purchases to partner claims;
- remittances and partner current account;
- partner statement and simple cash/bank operational views.

## M7 — Insight / Reporting / Replenishment
Read-mostly responsibilities:
- inventory master-detail report;
- stock card / Kardex;
- warehouse and container reports;
- inventory aging;
- sales ranking/trend;
- coverage and stockout risk;
- replenishment recommendation;
- provisional/final profit;
- partner capital/claim dashboards;
- FX/check risk.
Only controlled writes: report settings and “create PO draft” from replenishment recommendations.

---

# 3. Current codebase snapshot reviewed on 2026-10-04

Reviewed inputs:
- backend source archive `project.zip`;
- frontend source archive `index.zip`;
- SQL Server database script `yarnTradeScript.sql`.

Observed stack:
- Backend: ASP.NET Core / .NET 8, EF Core 8.0.28, SQL Server, ASP.NET Core Identity.
- Frontend: React 19 + TypeScript + Vite.
- Current deployment config includes a LAN HTTP API URL.
- Database script contains **49 tables** and **57 explicit nonclustered indexes** in addition to clustered PK indexes.
- SQL Server database uses compatibility level 160, `READ_COMMITTED_SNAPSHOT ON`, `RECOVERY FULL`, `PAGE_VERIFY CHECKSUM`, and Query Store enabled.

Current implemented domains already visible in source/schema:
- Identity/users/roles/user permissions;
- persons/master parameters/yarn types/yarn items/warehouses;
- purchase orders;
- purchase invoices, containers, item-container links and purchase costs;
- inventory movements and inventory layers;
- price lists and credit-rate rules;
- sales/payment schedules/cost allocations;
- checks/check operations;
- money documents;
- partner share rules/ledger/settlements;
- attachments and audit logs;
- backup/restore;
- basic reports/work items/presence.

This is a useful base and must be evolved, not discarded.

---

# 4. Immediate audit findings — must be fixed before expanding business scope

Priority meanings:
- **P0:** internet/security/data-integrity blocker.
- **P1:** fix before building dependent modules.
- **P2:** improve during the relevant module phase.

## P0-01 — Production secrets/configuration are unsafe
Status after A1 final verification: the current source snapshot has safe base defaults, no embedded admin password or SQL connection string in source configuration, production startup checks, and environment-driven frontend API settings. A1 is COMPLETE for the supplied source snapshot. No Git repository exists in the project directory or its parents; tracking/history verification is an environment/repository-state limitation, not an A1 implementation failure. Any credential previously used from tracked configuration still requires rotation.

Required correction:
- remove all real/default production credentials from tracked config;
- production secrets come from environment variables / protected secret store;
- production seed disabled;
- production automatic DB migration disabled; migrations are explicit deployment steps;
- force HTTPS externally;
- encrypt SQL connections and validate server certificates;
- rotate any credential that has ever been used from tracked configuration.

Acceptance:
- no production password/secret in repository;
- startup fails safely when required production secret/config is absent;
- production cannot silently create a known admin account.

## P0-02 — Authorization is route-string based and is not sufficient
The original `PermissionGuardMiddleware` inferred permissions from URL/method patterns. A3 removes that middleware and its resolver entirely. ASP.NET Core endpoint authorization now owns permission enforcement; no business endpoint uses URL inference as its authorization authority.

Required correction:
- use endpoint authorization policies/attributes/requirements as the authoritative authorization layer;
- permission names remain centralized;
- enforce both **action permission** and **data scope** server-side;
- frontend menu hiding is UX only, never security;
- every new endpoint must declare its authorization requirement explicitly;
- partner/sales-center data scope must be enforced in query/service layer.

Consider SQL Server RLS only as defense-in-depth for selected high-risk scope boundaries after the application data-scope model is stable; do not use RLS as a substitute for application authorization.

## P0-03 — File upload/download security is insufficient
**Status after A7: COMPLETE for the approved attachment-hardening scope.** Current shared local validation/quarantine/scanner seam, supported-parent authorization, safe metadata/download/audit and verification are recorded under A7. No external antivirus is deployed and unresolved business row ownership is not claimed.

Pre-A7 attachment upload:
- trusts client `ContentType`;
- preserves client extension in stored file name;
- has no allowlist/signature validation;
- has no malware scanning/quarantine workflow;
- generic `EntityType + EntityId` access is not proven against entity-level data scope.

Required correction:
- allowlist required document types/extensions;
- validate file signature/magic bytes where practical;
- generate server-side safe storage names without trusting user path/extension;
- store files outside public web root;
- set safe download headers;
- authorize upload/list/download/delete against the referenced entity and data scope;
- size limits per document class;
- optional malware scan adapter; for internet deployment, quarantine until scan result where feasible;
- audit upload/download/delete for sensitive documents;
- reject executables/scripts and dangerous archive types unless specifically approved.

## P0-04 — Inventory sale posting has a race condition
Current sale posting loads positive `InventoryLayers`, allocates in memory, then decrements `RemainingQuantity`. Two concurrent sales can read the same remaining stock before either commits.

Required correction:
- warehouse-specific FIFO remains the business rule;
- serialize allocation for `(WarehouseId, YarnItemId)` during posting using a proven SQL locking/concurrency strategy;
- keep posting and layer decrement in one DB transaction;
- ensure insufficient stock fails atomically;
- add a concurrent-sale integration test proving no double consumption.

Preferred simple implementation: transaction + deterministic SQL lock on candidate layers / lock key, then re-read remaining quantities inside the lock. Avoid distributed locks.

## P0-05 — `RowVersion` is not a real SQL Server rowversion
Current schema stores `RowVersion` as `varbinary(max)` and EF marks it as a concurrency token, but it is not database-generated SQL Server `rowversion`.

Required correction:
- map audited mutable aggregates that need optimistic concurrency with `.IsRowVersion()` / SQL `rowversion`;
- migration converts/recreates appropriately;
- API update commands carry concurrency token where needed;
- return 409/appropriate conflict on stale updates;
- do not use rowversion for append-only ledgers.

## P0-06 — Server must own authoritative financial/costing inputs
Current sale-post API accepts `UsdRate`, `CostingMethod`, and `PaymentToleranceIRR` from the client.

Required correction:
- posted financial values are resolved server-side from approved/effective-dated settings and rate records;
- client may request a business option only where the user is authorized and the option is allowed;
- never trust client-supplied cost, profit, exchange rate, partner share, or tolerance as authoritative;
- snapshots are written by server at posting time.

## P0-07 — Internet deployment baseline is not yet production-ready
Before internet exposure:
- reverse proxy / web server terminates TLS;
- HTTPS only + HSTS;
- secure headers;
- restricted CORS to exact production origins;
- rate limiting for login, password reset, uploads, expensive reports, and sensitive actions;
- no SQL Server port exposed publicly;
- API and SQL Server separated by firewall/network rules;
- centralized structured security logging;
- time synchronization;
- patch/update policy;
- tested encrypted backups and restore drill;
- health endpoint must expose no sensitive internals;
- production Swagger disabled or strongly restricted.

---

# 5. Database/model corrections before feature expansion

## DB-01 — Introduce stable origin lineage
Do not treat “lot” only as a warehouse-specific identity.

Target conceptual chain:

`PO Item → Proforma/Supplier Invoice Item → Shipment/Container Line → OriginLot → WarehouseInventoryLayer → FIFO Allocation`

Rules:
- `OriginLot` is the stable commercial/traceability identity.
- A warehouse layer represents quantity/cost state of an origin lot in one warehouse.
- Transfer creates destination layer(s) while preserving `OriginLotId`, original receipt/import date, source container line, and cost lineage.
- Future package/bale records attach to `OriginLot` / container line and can point to inventory movements.

This prevents traceability loss after multiple transfers.

## DB-02 — Separate shipment/container from purchase invoice
The current schema is invoice-centric (`PurchaseContainers.PurchaseInvoiceId`). Final architecture needs shipment/loading lifecycle independent enough to exist before supplier invoice/final landed cost.

Introduce incrementally:
- Shipment
- ShipmentContainer
- ShipmentContainerLine
- links from container line to one or more PO items as approved by business rules
- document/attachment links
- receipt/discrepancy status.

Do not destroy current purchase records; migrate/bridge them.

## DB-03 — Inventory movement ledger must be immutable after posting
Posted movement rows are append-only:
- corrections use reversal/adjustment rows;
- no destructive edits to posted stock history;
- each movement has source document, source line where relevant, origin lot, warehouse, quantity, cost snapshot, timestamp, actor/posting context.

## DB-04 — Transfer model
Required states:
`Draft → Approved → Dispatched/InTransit → Received` with discrepancy branch.

Source stock leaves source warehouse at dispatch.
Transit quantity is visible separately.
Destination stock is created only at confirmed receipt.
Destination confirmation records actual received quantity.
Discrepancy remains explicit until resolved.

## DB-05 — Landed-cost file
Need explicit state:
`Open/Provisional → Finalized → Reopened → Finalized`

Rules:
- sale can occur while cost is provisional;
- profit remains provisional;
- finalization/reopen requires permission/approval;
- recalculation must preserve audit/reversal lineage;
- manual allocation override requires reason and actor.

## DB-06 — Partner claim model must be designed before coding
Do not extend the current partner ledger blindly.

Before implementation, create and approve a one-page model plus numeric scenarios for:
1. cash sale;
2. credit/check sale;
3. bounced check;
4. USD purchase after IRR FX movement;
5. sales return before USD purchase;
6. sales return after partial/full USD purchase;
7. debt discounting;
8. over-remittance / partner debit balance.

Partner Capital and Partner Receivable are distinct:
- **Capital:** partner share in unsold inventory at actual historical cost; computed/reporting view.
- **Claim:** sold amount entitlement with principal/profit/credit-premium components and maturity/payability lifecycle.

## DB-07 — Effective-dated contract version
Every sale/claim-sensitive transaction must resolve and snapshot the applicable partner contract version.
Contract changes do not rewrite history.

## DB-08 — Check ledger
Keep one check identity and append check operations/custody history.
Do not duplicate a check per handoff.

## DB-09 — Customer/sales-center confidentiality
Introduce explicit data-scope model before external sales-center rollout.
External commission centers may have anonymized customer identity from company users depending on configured policy.
The restriction applies to APIs, reports, exports, search, attachments, and logs—not only UI.

---

# 6. Index review and policy

The current schema is not “without indexes”; the reviewed SQL script contains **57 nonclustered indexes**, and `AppDbContext` defines many useful business indexes.

Useful existing examples include:
- `InventoryLayers(WarehouseId, YarnItemId, ReceivedAtUtc)`;
- `InventoryMovements(WarehouseId, YarnItemId, MovementDateUtc)`;
- `Sales(SaleDate, CustomerId, SellerId)`;
- `Checks(DueDate, CurrentStatus)`;
- `PartnerLedgerEntries(PartnerId, EntryDate)`;
- unique business codes/numbers for yarn, warehouses, orders, money documents, etc.

However, index design must now follow actual access patterns rather than “index every FK/column”.

### 6.1 Required near-term index changes
During the corresponding migrations, evaluate/add:
- filtered FIFO index on inventory layers for available stock, conceptually:
  `(WarehouseId, YarnItemId, ReceivedAtUtc, Id) WHERE RemainingQuantity > 0`
  with included cost/origin columns as justified by query plan;
- movement drill-down indexes by source document and by origin lot;
- shipment/container number unique/lookup indexes where business uniqueness is confirmed;
- PO open-line lookup by supplier/product/status;
- sale outstanding/receivable lookup indexes;
- check custody/status/due-date lookup;
- partner claim maturity/status lookup;
- attachment lookup on `(EntityType, EntityId, UploadedAtUtc)`;
- audit lookup on `(EntityName, EntityId, TimestampUtc)` and/or actor/time based on actual screens.

### 6.2 Index rules
- No index is added without a known query/filter/order/join use.
- Unique constraints represent real business invariants, not only performance.
- Avoid `nvarchar(max)` for searchable/key business fields; set sensible maximum lengths.
- Prefer filtered indexes for active/open/remaining subsets where they materially reduce hot-path reads.
- Use Query Store and actual execution plans after representative data exists.
- Record every important index rationale in this document or migration comment.
- Periodically review unused/duplicate indexes; do not accumulate speculative indexes.

---

# 7. Security baseline for public-internet operation

This section is mandatory for production.

## 7.1 Identity and authentication
- ASP.NET Core Identity remains acceptable.
- Final owner decision 12.10: private/invite-only application; only Administrator creates accounts and changes the registered login email. No public registration, secondary login email or self-service email change.
- A newly invited user chooses their own password through a protected, one-time link (default 24 hours); pending accounts cannot enter the application. Administrator can reissue the invitation, invalidating the old link.
- Every normal user signs in with registered email/password, followed by EMAIL OTP for an untrusted browser. Identity's email token provider is used, with an opaque challenge, maximum 10-minute deadline, bounded attempts/sends, per-IP rate limits and single-use consumption. OTP is sent only to the registered email and is never stored in plaintext, logged or exposed by the API.
- Identity remembered-client cookies represent trusted browser profiles without fingerprinting: HttpOnly, SameSite=Strict, Secure outside Development, maximum 30 days with no sliding renewal. Ordinary logout revokes the active session while retaining browser trust; password/email/role/permission changes, deactivation and explicit Administrator security reset invalidate sessions/trust.
- TOTP is not selected for this version. Passkey/WebAuthn remains a possible future enhancement; EMAIL OTP is the owner's current device-verification decision.
- SMTP credentials and public frontend origin are external protected configuration; missing mandatory production SMTP/TLS configuration prevents startup. The small SMTP adapter is tested through a fake sender, not live delivery.
- Development auto-login is off in base settings and explicitly enabled in Development settings for the existing seeded Administrator. It requires real loopback plus local Host/Origin, rejects forwarded/remote Vite peers, and startup fails if the flag is enabled outside Development. Production frontend never auto-probes. Environment-specific Data Protection application names isolate Development tokens from Production.
- Strong password policy plus breached-password screening where feasible.
- Lockout/throttling must resist brute force without enabling easy denial-of-service.
- Password reset and account recovery are audited.
- Disable inactive users immediately.
- No shared administrator accounts.
- Session/token lifetime appropriate to role and risk.
- Sensitive operations may require recent re-authentication.

A2 client/API contract: `POST /api/auth/login` accepts `{email,password}` and returns either 202 `{requiresVerification,challenge,resendAfterSeconds,message}` or the normal Identity token response after valid browser trust. `POST /verify-email` accepts `{challenge,code}` and returns the session/token; `POST /resend-code` accepts `{challenge}` and returns a replacement 202 challenge. `POST /activate` and `/resetPassword` accept `{token,newPassword}`; `/forgotPassword` accepts `{email}` with a neutral 200 response. `/refresh` keeps `{refreshToken}` and rotates its session; `/manage/info` is read-only. `/register`, public email-change and authenticator-management APIs are removed intentionally; old API clients must adopt this private authentication contract. The optional cookie login/OTP mode requires CSRF. Administrator actions are `POST /api/users`, `POST /api/users/{id}/invitation`, `POST /api/users/{id}/security-reset`; only Administrator can change email through the existing update action.

Reference basis: NIST SP 800-63-4 / 800-63B-4.

## 7.2 Authorization
- deny by default;
- endpoint policy + data scope;
- least privilege;
- privileged actions separated from ordinary edit rights;
- approvals cannot be bypassed by direct API calls;
- exports obey same row/field scope as screens;
- partner portal can only see explicitly permitted business objects.

### 7.2.1 Implemented A3 authorization baseline (2026-10-06)
- `RequirePermissionAttribute`, `PermissionRequirement`, the dynamic `PermissionPolicyProvider` and scoped `PermissionAuthorizationHandler` use the existing ASP.NET Core authorization pipeline. Explicit action metadata combines with existing role restrictions; `PermissionCatalog.All`, role defaults and persisted grant/deny overrides are unchanged. There is no second permission catalog or framework.
- Every mapped endpoint declares permission-based access, an intentional anonymous exception, or an authenticated own-account/session exception with a reason. Default/fallback policies and the authorization result handler deny unclassified application routes, including role-only routes and Administrator. Startup validation rejects missing or conflicting classifications on all mapped endpoints. Coverage tests enumerate real endpoint metadata and fail when permission metadata is removed even if `[Authorize]` remains. Framework routing rejection endpoints execute no application action and retain normal 405/415 responses; unmatched URLs retain 404 behavior.
- Effective permissions are loaded once per user within the scoped request service; callers receive copies. A later request reloads current active-user roles and overrides, so permission revocation is not hidden behind a cross-request cache. Existing A2 session/security-stamp revocation remains intact. Server 401/403 controls access independently of menus.
- `IDataScope` / `CurrentUserDataScope` provides authenticated identity and an explicit own-user decision. Own settings/password and access-profile operations enforce matching authenticated user identity; presence and work-item state derive actor identity from that same seam. Work-item queries retain `UserTaskStates.UserId` filtering and existing Commerce/WarehouseOperator routing, now also requiring `dashboard.view` and the applicable `commerce.view` / `inventory.view`. Starting a commerce-order action additionally requires `commerce.accept` before any task or order state is changed. Administrator access to forms does not imply operational inbox membership.
- **Not activated:** customer, sales-center, seller, partner, warehouse and business-record ownership restrictions. Existing relationships do not define a complete approved ownership model. `BusinessRecord` decisions return false, but this undefined scope is deliberately not applied to business queries: existing permission-authorized broad business visibility remains. This baseline must not be represented as completed customer/center/partner isolation or sufficient external portal confidentiality. Owner decisions and later scoped-query work remain required under DB-09 and the relevant roadmap stages.
- Attachments keep `commerce.view` for list/download and `commerce.upload` for upload/delete. A7 now adds supported existing parent checks and file hardening; unresolved customer/partner row ownership remains deferred rather than guessed. Backup endpoints keep their existing Administrator/Manager role boundary plus `dataBackup.view/create/restore`; A8 backup behavior is unchanged. User creation, invitation reissue, security reset and email/Administrator-role management remain Administrator-only; permission/role changes still require the existing `users.permissions` guard.
- Seven fixed sequence-suggestion actions preserve all supported URLs and numbering logic while making each permission explicit. Unknown scope URLs now return 404. No schema migration, runtime dependency, frontend change or later work package is introduced.

### 7.2.2 A3 endpoint audit and permission mapping
The initial audit covered all 96 mapped production endpoints: 77 business actions, nine authenticated own-account/session actions and ten anonymous endpoints. The single sequence-suggestion action became seven explicit actions, producing **102 mapped production endpoints: 83 business, nine own-account/session and ten anonymous**. Inventory currently has warehouse master-data and stock-report endpoints; there is no separate inventory controller. Partner ledger is a report and partner settlement is a finance operation; no separate partner controller or ownership model is invented.

| Controller / actions | Explicit permission | Additional boundary / scope |
| --- | --- | --- |
| MasterData: Persons, PersonById, Parameters | persons.view | Business ownership deferred |
| MasterData: CreatePerson / UpdatePerson / DeletePerson | persons.create / persons.edit / persons.delete | Business ownership deferred |
| MasterData: Yarns / CreateYarnType, CreateYarn | yarns.view / yarns.create | Business ownership deferred |
| MasterData: Warehouses / CreateWarehouse | inventory.view / inventory.edit | Business ownership deferred |
| MasterData: Rates / CreateRate | finance.view / finance.create | Business ownership deferred |
| Yarns: List, ById / Create / Update / Delete | yarns.view / yarns.create / yarns.edit / yarns.delete | Business ownership deferred |
| PurchaseOrders: List, Get / Create / Update / Delete / Submit / Accept | purchaseOrders.view / purchaseOrders.create / purchaseOrders.edit / purchaseOrders.delete / purchaseOrders.submit / commerce.accept | Business ownership deferred |
| Commerce: Workbench, OrderWorkbench, Comparison / CreateInvoice / Import / SendToWarehouse | commerce.view / commerce.edit / commerce.upload / commerce.sendToWarehouse | Business ownership deferred |
| Purchases: Search, Get / Create, Import / Update / Post | purchases.view / purchases.create / purchases.edit / purchases.post | Business ownership deferred |
| Sales: Search, Get / Create, CalculateCredit / Post, Reverse | sales.view / sales.create / sales.post | Business ownership deferred |
| Finance: Documents / CreateDocument / PostDocument | finance.view / finance.create / finance.post | Business ownership deferred |
| Finance: Checks / CreateCheck / TransitionCheck | checks.view / checks.create / checks.edit | Business ownership deferred |
| Finance: CreateSettlement / PostSettlement | finance.create / finance.post | Partner ownership deferred |
| Reports: all five actions, including stock and partner ledger | reports.view | Row/field ownership deferred |
| Attachments: List, Download / Upload, Delete | commerce.view / commerce.upload | A7 supported existing PurchaseOrder/PurchaseInvoice parent checks; undefined business row ownership still deferred |
| Users: List, Catalog, Get / Update | users.view / users.edit | Administrator or Manager; inline Administrator/email and users.permissions guards preserved |
| Users: Create, ReissueInvitation / ResetSecurity | users.create / users.permissions | Administrator only |
| SystemBackup: Info, OnlineUsers / MaintenanceNotice, CancelMaintenanceNotice, Export / Restore | dataBackup.view / dataBackup.create / dataBackup.restore | Administrator or Manager; A8 deferred |
| WorkItems: List, MarkViewed, StartAction | dashboard.view | Own task state and existing role routing; workflow view and commerce.accept checks as above |
| SequenceSuggestions: person / yarn / purchase-order / purchase-invoice / sale-invoice / receipt, payment | persons.view / yarns.view / purchaseOrders.view / purchases.view / sales.view / finance.view | Existing supported numbering unchanged |
| Users.MyAccess; UserSettings.Get, Update, ChangePassword; Presence.Heartbeat, Logout, Notice; auth manage/info, mfa-status | Explicit authenticated own-account/session classification | Identity derived from authenticated user, no arbitrary target user |
| Private auth login, verify-email, resend-code, refresh, activate, forgotPassword, resetPassword, development-session; auth csrf; health | Explicit AllowAnonymous | Existing A2 challenge, origin, environment and rate-limit controls remain |

## 7.3 Web/API protection
- HTTPS only;
- HSTS;
- exact AllowedHosts / reverse-proxy host validation;
- exact CORS allowlist;
- request size/time limits;
- rate limiting;
- anti-forgery protection if cookie-authenticated browser flows are used;
- validate all DTOs server-side;
- do not bind EF entities directly for security-sensitive writes; use request DTOs;
- ProblemDetails without stack traces/secrets in production;
- secure response headers;
- no sensitive values in URLs;
- pagination caps on list/report APIs.

## 7.4 Database protection
- SQL Server never internet-facing;
- dedicated least-privilege application DB identity;
- separate deployment/migration/backup privilege from runtime application privilege where practical;
- encrypted SQL transport with certificate validation;
- TDE if available/licensed/operationally appropriate; otherwise encrypted volume plus encrypted backups is mandatory;
- encrypted backups regardless;
- SQL Server Audit / infrastructure audit for privileged activity;
- Query Store retained;
- regular integrity checks and restore tests;
- `READ_COMMITTED_SNAPSHOT` may remain, but critical inventory allocation still requires explicit concurrency control.

Microsoft SQL Server guidance also recommends least privilege, encrypted connections, encryption at rest, auditing, and tested backups.

## 7.5 Sensitive data
High-sensitivity fields include:
- customer identity/contact data;
- check/bank/account details;
- partner financial data;
- attachments/documents;
- credentials/secrets.

Rules:
- collect only required data;
- mask/redact where role does not require full value;
- do not write secrets, tokens, full check/bank data, or confidential customer details to normal logs;
- consider application/column encryption for especially sensitive values after query/search requirements are known;
- customer confidentiality is enforced server-side.

## 7.6 Attachments
See P0-03. Also:
- backup attachments together with DB metadata;
- orphan-file reconciliation job/report;
- retention rules later;
- download through authorized controller, not static directory.

## 7.7 Audit and observability
Audit business events, not every harmless read.
Mandatory audit categories:
- login failures/lockouts;
- user/role/permission/data-scope changes;
- approval decisions;
- posting/reversal;
- cost finalization/reopen;
- exchange-rate finalization;
- USD purchase/remittance;
- partner contract changes;
- check status/custody changes;
- backup/restore;
- sensitive export;
- attachment deletion.

Audit records should be append-only from the application perspective.

## 7.8 Backup / disaster recovery
Current backup/restore work is a useful base but production requires:
- scheduled DB full/differential/log strategy appropriate to RPO/RTO;
- encrypted backups;
- off-server/offsite copy;
- attachment backup synchronized with metadata;
- restore test on a separate environment;
- documented RPO/RTO;
- backup operation not dependent solely on an HTTP request;
- restore restricted to highest privilege and preferably maintenance procedure;
- alert on backup failure.

---

# 8. API/data-integrity rules

- Controllers accept DTOs, not unrestricted entity graphs, for important writes.
- Server computes authoritative totals, costs, rates, status transitions, partner shares, and permissions.
- All posting operations are idempotency-aware: duplicate submit/post must not duplicate ledgers.
- Posted documents are reversed, not edited in place.
- State transitions are explicit and validated.
- Every business document has a stable internal ID and controlled human-readable number.
- Monetary/weight precision is explicitly defined by domain, not inferred only from property name.
- UTC timestamps for technical events; business dates stored explicitly as dates.
- Jalali/Gregorian is presentation, not duplicate underlying dates.
- Foreign keys remain restrictive by default; cascade only for true owned child rows.
- Use database constraints for critical invariants where practical.

---

# 9. Required test strategy

There is currently no meaningful automated test project in the reviewed source. Add tests before expanding critical financial/inventory logic.

## 9.1 Unit tests
- credit-price rules;
- weighted due date;
- FIFO allocation;
- landed-cost allocation;
- replenishment formulas;
- partner claim formulas;
- contract version resolution.

## 9.2 Integration tests with SQL Server
Must cover real transaction/concurrency behavior:
- two concurrent sales against same `(warehouse, yarn)` cannot oversell;
- purchase posting atomicity;
- sale posting atomicity;
- reversal restores exact FIFO lineage;
- transfer dispatch/receive/discrepancy;
- provisional → final → reopen cost;
- rowversion conflict;
- duplicate post/idempotency;
- check handoff/bounce;
- partner claim lifecycle;
- FX purchase allocation/remittance.

Do not rely only on EF InMemory for transaction/concurrency tests.

## 9.3 Security tests
- every protected endpoint unauthenticated → 401;
- authenticated but unauthorized → 403;
- cross-sales-center/cross-partner data access blocked;
- direct API cannot bypass hidden menu;
- upload rejects disallowed files;
- exports respect data scope;
- privilege escalation attempts fail.

---

# 10. Step-by-step roadmap

Each work package is intentionally bounded. Complete and update this document before moving to the next.

## PHASE A — Stabilize existing foundation (do this first)

### A1 — Repository hygiene and configuration split — P0
- add proper `.gitignore` for backend/frontend build outputs, secrets, local DB/attachments;
- remove `obj`, `bin`, `dist` from source control if tracked;
- create production-safe config model;
- remove default admin password from tracked config;
- disable production seed and auto-migrate;
- HTTPS/TLS production settings documented;
- environment-specific frontend API URL.
**Exit:** clean build from source without committed build artifacts/secrets.
**Status (2026-10-06): COMPLETE.** Implemented secure base defaults, Development-only auto-migration/demo seed, protected configuration requirements, SQL TLS validation, local secret setup documentation, build-output/local-data ignore rules, and environment-driven frontend API settings. The project root is `C:\project\yarn-trade-system`; this Master is located there with no duplicate in `C:\project`. Final source-inventory checks found no unignored build outputs, local database files, attachment storage, local secret files, or literal default credentials. Local `bin`/`obj`/`dist` outputs remain correctly ignored. The non-incremental backend Release solution build and frontend production build pass; the prior 61-test run passed. No Git repository was detected in the project directory or any parent, so tracked-file/history verification is recorded as an environment limitation and tracked-output removal is not applicable to this snapshot. A2 has not been started.

### A2 — Authentication and internet security baseline — P0
- private invitation, email device verification and trusted-browser authentication per final owner decision 12.10;
- rate limiting;
- HSTS/HTTPS/reverse proxy config;
- exact CORS/host rules;
- production error handling/logging;
- token/session review.
**Exit:** security smoke tests pass.

**Status (2026-10-06): COMPLETE.** Owner decision 12.10 is resolved. Private invitations, mandatory email device verification for every normal user, fixed 30-day browser trust, Administrator-only account/email management, password recovery and explicit loopback-only Development login are implemented on the existing `a2-auth-security-baseline` branch. The earlier A2 rate limiting, HTTPS/HSTS, trusted proxies, exact hosts/CORS, safe errors/logging and CSRF controls remain. Existing Identity tables hold challenge/session metadata; no schema migration or runtime dependency was added. All 137 backend tests (61 existing and 76 focused security cases), the non-incremental Release solution build (zero warnings/errors), and frontend production build/typecheck pass. Focused Development tests verify explicit local login with real Administrator roles, disabled/remote/forwarded denial and development-session restrictions. Actual Production entry-point smoke checks verify health 200, protected report 401, development endpoint 404, invalid Host 400, HTTP redirect 308 and HSTS through a trusted local proxy. Production startup rejects an enabled development bypass and missing SMTP configuration. Email tests use a fake sender; live SMTP delivery and a live SQL-backed laptop/browser login were not exercised in this environment. External deployment SMTP/SQL configuration remains an operational prerequisite, not an unfinished A2 implementation. No business module or route-permission design was changed. A3 has not been started.

### A3 — Replace route-derived permissions — P0
- endpoint policy-based permission requirements;
- central permission catalog retained;
- introduce explicit data-scope abstraction;
- migrate existing endpoints;
- security tests.
**Exit:** no business endpoint depends on URL inference as its sole authorization.

**Status (2026-10-06): COMPLETE.** All 83 current business endpoints use explicit permission metadata; the complete 102-endpoint metadata inventory passes classification checks. No business endpoint depends on URL inference as its sole authorization. All 209 backend tests pass (137 existing plus 72 A3 cases), with zero failures or skipped tests. The non-incremental Release solution build succeeds with zero warnings/errors. Scope and endpoint mapping are recorded in sections 7.2.1–7.2.2. The existing permission catalog/defaults, A2 authentication and Administrator-only controls are preserved. No migration, runtime dependency or frontend change was required; frontend verification is not applicable. Business ownership decisions remain explicitly deferred; no A4 work has started.

### A4 — Fix RowVersion/concurrency model — P0
- SQL `rowversion`;
- conflict handling;
- migrate mutable aggregates.
**Exit:** stale update test returns conflict.

**Status (2026-10-06): COMPLETE.** Implementation was completed on `a4-rowversion-concurrency`, based on approved A3 master `f933fff8d844660704dc3fd844a4aba76a8f38e5`, and subsequently approved and fast-forward merged into `master` at `d9c07409b19375436190e26e33b77585dcdc8ae4`. All 220 backend tests pass (209 existing + 11 A4, including five real SQL Server cases; zero failures/skips). The non-incremental Release solution build succeeds with zero warnings/errors, and frontend typecheck/production build succeeds. A5/A6/A7 had not started at A4 completion.

#### A4 aggregate audit and coverage

All 16 current `AuditedEntity` descendants represent mutable directory/configuration/document records or owned costs (classification A). None is an append-only ledger, and no uncertain descendant was changed. Configuration types without an existing edit endpoint receive the correct database mapping without introducing new commands or UI.

| Entity / aggregate | SQL rowversion | Existing mutation of an existing record | Expected token | Reason |
|---|---|---|---|---|
| Person | Yes | `PUT/DELETE /api/master-data/persons/{id}` | Person | Editable directory; deletion must respect the version read. |
| ParameterValue | Yes | None | No current interactive mutation | Mutable directory configuration; existing parameter API is read-only. |
| YarnType | Yes | None | No token for creation | Mutable yarn classification; current API only creates/reads. |
| YarnItem | Yes | `PUT/DELETE /api/yarns/{id}` | YarnItem | Editable directory; existing history checks remain. |
| Warehouse | Yes | None | No token for creation | Mutable warehouse configuration; current API only creates/reads. |
| ExchangeRate | Yes | None | No token for creation | Dated configuration, not an append-only ledger; current API creates/reads only. A5 FX authority is unchanged. |
| PurchaseOrder | Yes | `PUT/DELETE /api/purchase-orders/{id}`; `POST .../submit`, `.../accept`; `POST /api/commerce/orders/{id}/invoice`, `.../import`; `POST /api/work-items/commerce-order:{id}/action` | PurchaseOrder | Protects header, replacement items and user intent in workflow actions. Returning an already-existing commerce invoice is an idempotent read and performs no mutation. |
| PurchaseInvoice | Yes | `PUT /api/purchases/{id}`; `POST .../post`; `POST /api/commerce/invoices/{id}/send-to-warehouse` | PurchaseInvoice | Protects header/child replacements and posting. Linked order completion is an internal effect using the tracked order's own database token. |
| PurchaseCost | Yes | No independent interactive update endpoint | Parent invoice for existing aggregate commands | Owned mutable cost, not a ledger. No new cost editing behavior is introduced. |
| PriceList | Yes | None | No current interactive mutation | Mutable pricing configuration used by calculations. |
| CreditRateRule | Yes | None | No current interactive mutation | Mutable, dated/versioned pricing configuration used by calculations. |
| Sale | Yes | `POST /api/sales/{id}/post`, `.../reverse` | Sale | Protects document state; existing credit/status checks and financial inputs are unchanged. |
| MoneyDocument | Yes | `POST /api/finance/money-documents/{id}/post` | MoneyDocument | Protects document posting; current creation needs no prior token. |
| Check | Yes | `POST /api/finance/checks/{id}/transition` | Check | Protects check state; existing allowed-transition rules remain. |
| PartnerShareRule | Yes | None | No current interactive mutation | Mutable sharing configuration, separate from partner ledger entries. |
| PartnerSettlement | Yes | `POST /api/finance/settlements/{id}/post` | PartnerSettlement | Protects settlement posting and its atomic ledger write. |

`InventoryMovement`, `PartnerLedgerEntry`, `CheckOperation`, `AuditLog` and allocation/history rows retain their plain-entity mapping without rowversion. Plain child rows use their aggregate root's token. `InventoryLayer` remains unchanged: its FIFO allocation/oversell protection belongs to A6. Own-user task view markers and warehouse action markers mutate only `UserTaskState`, so they require no document token. Identity/session/settings and attachments are outside the audited aggregate contract; their existing security behavior is preserved.

#### A4 schema, migration and seed contract

- `AuditedEntity.RowVersion` maps through EF `IsRowVersion()` to SQL Server's database-generated 8-byte rowversion (`timestamp` semantics), with generated values ignored on application writes.
- One migration: `20261006141731_FixSqlRowVersionConcurrency`. SQL Server cannot directly ALTER varbinary into rowversion, so Up replaces only the token column on the 16 audited tables. Business tables/rows, relationships, indexes and other columns remain intact. Down replaces only the token with a legacy non-semantic varbinary placeholder. Both directions are tested on disposable SQL Server databases.
- Applied migrations are untouched. The snapshot changes only rowversion metadata and removal of explicit token values from seeds. Anonymous seeds omit the generated column; existing seed business values and applied creation timestamps are preserved. The model has no pending migration differences.

#### A4 client/API contract

- JSON `rowVersion` is an opaque Base64 string representing exactly eight bytes. Every protected edit/delete/state command uses the same URL query parameter: `?rowVersion={URL-encoded-Base64}` (or `&rowVersion=...` after other query parameters). Clients must retain the version they read, including for DELETE and multipart commerce imports.
- Blank/missing token: HTTP 400 `CONCURRENCY_TOKEN_REQUIRED`. Invalid Base64, noncanonical encoding or a decoded length other than eight: HTTP 400 `INVALID_CONCURRENCY_TOKEN`. Existing authorization and model/status validation remain in place.
- Stale intent or EF `DbUpdateConcurrencyException`: HTTP 409 `CONCURRENCY_CONFLICT`, with the Persian reload/review message. A current token may be included when already safely loaded. The exception has a separate catch before duplicate-code `DbUpdateException` catches; a small MVC exception filter handles other aggregate actions.
- The expected token is assigned to EF `OriginalValue`, never written to the column. Header/child-only edits force an ordinary parent update using the existing `UpdatedAtUtc` behavior. New replacement items/containers are explicitly Added; a failed SaveChanges rolls back the entire database mutation. Commerce import defers its database save so invoice/attachment metadata and order state save atomically. File storage hardening remains A7.
- Successful mutations return HTTP 200 with the new token (existing full views or `{id,rowVersion}`); successful deletion remains 204. Commerce invoice creation returns `{invoice,rowVersion}` where the top-level token belongs to the order and `invoice.rowVersion` belongs to the new invoice. Commerce import keeps its existing invoice/warnings/mapping fields and adds the order's `rowVersion`. Creation of an independent record requires no expected token.
- Controllers and `PostingService` share the scoped DbContext: tracked invoice/sale roots carry the expected OriginalValue into the existing posting/reversal save, without changing service formulas, FIFO allocation or transactions. Internal demo seeding creates its own new documents and has no stale browser intent.
- Current UI callers in `api.ts`, `PersonsPage.tsx`, `YarnsPage.tsx`, `PurchaseOrdersPage.tsx`, `CommercePage.tsx` and `App.tsx` retain/send/refetch versions. On exactly 409 + `CONCURRENCY_CONFLICT`, they show a clear message and refetch the current record/work item. Stale edits are never automatically replayed or silently merged. No new UI was created for backend-only actions.

#### A4 verification and explicit limits

- Real SQL Server tests require protected process environment variable `YARN_TRADE_SQL_TEST_CONNECTION` pointing to `master`. No connection string or credentials are committed. Tests create only uniquely named `YarnTrade_A4_Test_{GUID}` databases and validate that exact prefix/GUID before cleanup; the owner's normal database is never migrated, reset or deleted.
- Five real-SQL cases cover all 16 column schemas, seed/insert-generated tokens, changed update tokens, two independent contexts rejecting stale writes, authenticated HTTP stale/current updates and stale deletes, child-only order/invoice edits, workflow gates, token rejection across the remaining mutation routes, and an actual race after controller read returning the concurrency code rather than a duplicate-code error. The migration test applies pre-A4 migrations, inserts business data, migrates Up, rolls back only A4 and reapplies it while preserving rows and values.
- Existing security tests remain; the only InMemory fixture adjustment supplies a fixed test token for the existing positive work-item action. InMemory does not simulate generation/incrementing and is not used as concurrency proof.
- Final verification: 220/220 backend tests pass with zero failures/skips, including all 11 A4 cases and all previous A2/A3 coverage. Real SQL Server 2022 (16.0.1000.6): schema, generated tokens, EF/API stale-write rejection, current-token retry, stale delete, child updates and pre-A4 → A4 → pre-A4 → A4 data preservation all pass in isolated temporary databases. Non-incremental Release solution build: zero warnings/errors. Frontend `tsc --noEmit` and Vite production build: pass. The SQL API tests use the existing isolated authentication harness (ephemeral keys/fake email); they do not claim live production authentication/SMTP validation.
- At A4 completion, client posting authority still required A5 and inventory allocation concurrency still required A6. Both packages are now complete and merged as recorded below. A4's rowversion alone is not inventory locking. A7 has not started.

### A5 — Make posting inputs server-authoritative — P0
- sale USD rate resolved from approved exchange-rate record;
- costing method/tolerances from effective settings;
- credit override requires explicit permission/approval;
- remove authoritative financial values from client post request.
**Exit:** tampered client request cannot alter authoritative cost/rate.

**Status (2026-10-06): COMPLETE, approved and merged into master.** Implemented on `a5-server-authoritative-posting`, created from approved master `d9c07409b19375436190e26e33b77585dcdc8ae4`; final approved A5 master is `978e7a8d231e48dc3d6282548719a93d74821b33` (including the retry-response correction). The tampered-request exit criterion is satisfied. Initial verification below recorded 262 tests; the final approved baseline has 265 tests, including 45 A5 cases (44 real SQL). Non-incremental Release build: zero warnings/errors.

#### A5 input audit and posting boundary

The existing sale creation endpoint accepts an entity graph. A5 preserves that contract and its business inputs, but posting replaces financial results before creating allocations, inventory movements or partner ledger entries. The posting request now contains only `CreditLimitOverrideRequested` (default false); legacy financial and approver JSON properties have no binding or authority.

| Classification | Existing inputs / fields | A5 treatment |
|---|---|---|
| A — user business input | Route sale ID and expected query `rowVersion`; sale number/date, customer, seller, warehouse, mode, credit-pricing mode; item yarn/quantity, cash price/source and agreed credit unit price; payment arrangement/contract dates/days; schedule sequence/method, IRR/USD amounts, due date, check reference; notes; override request | Preserve existing business rules. The expected version remains an A4 intent gate; override is only a request. Agreed prices remain inputs under the current baseline. |
| B — server authority | Exact-date final USD→IRR rate record; effective `CostingMethod` and `RoundingToleranceIRR`; persisted effective permissions/credit limit/account balance; existing applicable active `PartnerShareRule` percentages; authenticated actor/approver; generated document/child IDs and document state | Resolve inside `PostingService`, using one narrow `SalePostingAuthority` resolver and the existing account/permission services. No public service parameter accepts a rate, costing method, tolerance or approver ID. |
| C — server calculated / snapshots | Root cash/credit/increase totals, weighted days/due date and posting timestamp; schedule conversion rate and derived day count; item `CostingMethodSnapshot`, `CostUSD`, `ExchangeRateSnapshot`, `CostIRR`, `CashTotalIRR`, `CreditTotalIRR`, `CreditIncreaseIRR`, `CashProfitOrLossIRR`; allocation/movement costs and partner share amounts | Recompute and overwrite at posting. Empty schedules clear weighted days/date. Ledger amounts use those results and existing server-selected share rules. Client-calculated values cannot become posting authority. |
| D — future / unresolved, unused as posting authority | Actual received amounts/date/status and later realized payment FX; informational credit-percent/rule-version metadata; creation metadata; future partner claims/remittance rules and allocation concurrency | No new settlement, claim, credit-pricing redesign or locking semantics. These fields do not set A5 posting cost, conversion rate, payment tolerance or partner shares. |

#### A5 resolution, credit approval and audit

- Rate: exactly one persisted `ExchangeRate` with `RateDate == Sale.SaleDate`, `FromCurrency == USD`, `ToCurrency == IRR`, `IsFinal == true`, and `Rate > 0`. No earlier/later-date fallback. Missing, nonfinal, wrong-pair, nonpositive or ambiguous final rates return HTTP 409 `SALE_EXCHANGE_RATE_REQUIRED`. The existing unique pair/date index is retained; the resolver also rejects ambiguity defensively.
- Settings: use the existing keys `CostingMethod` and `RoundingToleranceIRR`, ordered by greatest `ValidFrom <= SaleDate`. Future settings do not apply, and an invalid newest setting does not fall back to an older one. Missing values return 409 `POSTING_SETTING_MISSING`; invalid or ambiguous latest values return 409 `POSTING_SETTING_INVALID`, with the setting key and a safe Persian message. Existing unique key/date indexing is sufficient; no new settings/indexes/migration.
- Costing method must name an existing supported enum member (FIFO, LIFO or WeightedAverage). Allocation formulas, layer ordering and partner-rule precedence remain the existing baseline; A5 only chooses the method from the server setting.
- `RoundingToleranceIRR` is a nonnegative invariant-culture decimal and is the single existing IRR payment/rounding tolerance used for sale payment reconciliation. The existing absolute-difference formula is unchanged. Mismatch returns 409 `SALE_PAYMENT_TOTAL_MISMATCH`; client tolerance cannot widen it.
- Every schedule's `ExchangeRate` is overwritten with the same selected sale-date rate, and `DueDaysFromSale` is derived again from its due date. Both payment validation and weighted due-day calculation use this server conversion snapshot. This defines no later actual-payment FX settlement behavior.
- Added exactly one sensitive permission, `sales.creditOverride`. Administrator/Manager receive it through their existing all-permission defaults. SalesOperator/Seller and all other operational roles do not inherit it through menu prefixes; all prior A3 defaults remain. Explicit persisted grants/denials continue through the existing `UserPermission` mechanism, without a new authorization architecture.
- Projected credit debt still uses the existing account summary plus quantity × agreed credit unit price. Over limit without a request returns the existing 409 `CREDIT_LIMIT_EXCEEDED` and debt/limit metadata. A requested override without effective permission returns 403 `CREDIT_OVERRIDE_FORBIDDEN`, `permission: sales.creditOverride`, and a Persian error. An authorized request permits posting. Under the limit, `sales.post` alone suffices even when the flag is true, and override-used is false.
- The authority decision is appended to the existing `AuditLog` as `SalePostingAuthority`, atomically with posting. `UserId` is the authenticated actor; safe JSON contains only rate record ID/date/value, method, tolerance, actual override-used and authenticated approver ID when used (otherwise null). Request `CreatedBy`/`ApprovedBy` cannot identify the approver. No secrets or full sale copy are logged.
- The A4 controller token gate is unchanged and precedes authority checks. The existing sale transaction now runs inside SQL Server's configured execution strategy so real SQL posting works with `EnableRetryOnFailure`. A transient retry clears failed tracked effects and retains the original expected sale token; it does not replay against a newer document. This adds no inventory locks, isolation change, warehouse serialization or layer concurrency strategy.
- Successful sale posting returns the RowVersion produced by the final successful database execution-strategy attempt; callers never rely on a pre-retry tracked entity.
- No schema/entity/migration/dependency/frontend changes. There is no implemented frontend sale-post caller to adapt. Purchase posting, reversal behavior, A2 security architecture and Phase F remain unchanged.

#### A5 verification and remaining scope

- Added 42 A5 cases (41 real SQL posting cases and one contract check), using the existing A4 GUID disposable-database harness, protected process-only `YARN_TRADE_SQL_TEST_CONNECTION`, and SQL retry configuration matching the production provider. No required SQL test is skipped and the owner's normal database is never used.
- Coverage includes every rate rejection, latest/missing/invalid settings, all three server-selected costing methods against malicious legacy JSON, invariant/zero tolerance boundaries and attempted widening, nested FX validation/weighted dates, all calculated item/root values, inventory/allocation/partner outputs, role snapshots/grants/denial/override approver identity, under-limit `sales.post` alone, A4 missing/malformed/stale/new-token behavior, a real late-save concurrency rollback, and historical snapshot/audit/ledger stability after later rate/settings/share-rule edits.
- Final verification: 262/262 backend tests pass, with zero failures/skips, including all 42 A5 cases, all 11 A4 cases and prior A2/A3 coverage. Real SQL Server 2022 tests prove that extreme legacy posting parameters and malicious stored financial fields cannot alter authoritative cost/rate/tolerance/partner results; credit permissions/audit and A4 generated-version/atomic rollback regressions pass. Non-incremental Release solution build succeeds with zero warnings/errors. Frontend is unchanged, so a frontend build is not required for A5.
- At A5 completion, inventory allocation concurrency still required A6; A5's document version and transaction alone did not prove inventory safety. A6 is now complete and merged as recorded below. A7, Phase F partner claims, purchase/remittance FX, GL/accounting and sales UI redesign have not started.

### A6 — Fix FIFO concurrent sale race — P0
- transaction/locking strategy;
- deterministic FIFO ordering;
- concurrent integration test.
**Exit:** oversell/double-consume impossible under tested concurrency.

**Status (2026-10-06): COMPLETE, approved and fast-forward merged into master at `ee7861ed55b7616647f348eb82bd361c87b1884e`.** Started from approved A5 master `978e7a8d231e48dc3d6282548719a93d74821b33`, on `a6-inventory-concurrency`. Verification at A6 completion: 298/298 backend tests pass (265 existing + 33 A6), zero failures/skips, including 82 real SQL cases (5 A4 + 44 A5 + 33 A6). Non-incremental Release build: zero warnings/errors. Frontend typecheck/production build passes without source changes. A7 has not started.

#### A6 inventory concurrency boundary

- Posting keeps its existing atomic transaction and SQL execution strategy. Before any allocation/decrement, it locks every distinct `(Sale.WarehouseId, YarnItemId)` required by the sale, ordered by SQL Server `uniqueidentifier` comparison (`SqlGuid`), independent of item order. Reversal uses the same stock-key boundary/order for the yarns whose persisted allocations restore layers.
- Each key uses one parameterized EF `FromSqlInterpolated` query: `SELECT * FROM [InventoryLayers] WITH (UPDLOCK, HOLDLOCK, ROWLOCK, INDEX([IX_InventoryLayers_WarehouseId_YarnItemId_ReceivedAtUtc]), FORCESEEK) WHERE [WarehouseId] = @warehouse AND [YarnItemId] = @yarn ORDER BY [ReceivedAtUtc] ASC, [Id] ASC`. `UPDLOCK` holds update locks until transaction end; `HOLDLOCK` applies serializable key-range semantics to this inventory read, including an empty key. Overall transaction isolation remains READ COMMITTED; production RCSI settings are unchanged.
- The seek covers only the requested warehouse/yarn pair, including depleted rows that a reversal could restore. Exact freshly materialized locked rows are attached and used for allocation; previously tracked rows for that key are detached so stale values cannot override the locked database state. There is no subsequent ordinary layer query, whole-inventory load, global/process lock or layer rowversion change.
- After all keys are locked, group sale lines by yarn and sum demand, including repeated yarn lines. Sum positive remaining stock for each group. Insufficiency returns HTTP 409 `INSUFFICIENT_STOCK` with a safe Persian error and `warehouseId`, `yarnItemId`, `requiredQuantity`, `availableQuantity`. No allocation/decrement happens before this precheck. A rejected sale remains Draft with no new movements, allocations, partner ledger entries or posting audit.
- FIFO consumes `ReceivedAtUtc ASC, Id ASC`; LIFO consumes `ReceivedAtUtc DESC, Id DESC`, with SQL-compatible GUID comparison for equal dates. WeightedAverage retains the existing average-cost formula and consumes physical layers in FIFO/date-ID order. All three methods use the same locks/precheck. Locked stock is checked for negative quantities before mutation and again before save; violations abort without clamping.
- Locks, stock checks, allocations/decrements, movements, partner entries, document status, audit, save and commit share one transaction. Reversal restores its existing allocation quantities under the same locks and retains existing financial/movement semantics. Its transaction now runs inside the configured SQL retry strategy; each retry clears failed tracked changes, reacquires stock and preserves the original expected Sale RowVersion. Successful post/reverse returns the final database-generated token. A4 stale-token rejection and A5 authority/rate/settings/credit/partner formulas remain intact.

#### A6 index decision and practical limits

- No schema/index migration is required. Existing `IX_InventoryLayers_WarehouseId_YarnItemId_ReceivedAtUtc` supplies the warehouse/yarn prefix and date order; clustered primary-key `Id` is the implicit nonclustered locator/tie column. An actual `SET STATISTICS XML ON` plan for the captured parameterized query, against two target and 2,000 unrelated layers, verifies this index's Index Seek, the Id column and absence of Table Scan/Index Scan. The query deliberately depends on this existing index name.
- Queries/load scale with distinct requested yarns and historical layer count within each requested pair, including zero rows, rather than total inventory. `ROWLOCK` is advisory: SQL Server may still escalate locks for large ranges, and adjacent serializable key gaps can contend. This is not a promise that every unrelated key is contention-free; a real SQL test with separated key ranges proves that independent stock operations can hold locks concurrently, without deliberate table/global locking.

#### A6 verification and deferred integrated-review finding

- New tests reuse the existing A4 GUID disposable SQL database harness and protected process-only `YARN_TRADE_SQL_TEST_CONNECTION`; no owner database, credentials, new harness or runtime dependency. Concurrent HTTP requests use independent contexts/connections, a controlled gate while a real SQL lock is held, and `sys.dm_exec_requests` to verify blocking before releasing the holder.
- Capacity coverage: all three costing methods, RCSI OFF/ON, 7+7 against stock 10 (one winner, final 3, Draft loser without effects), and 5+5 (both winners, final zero). An isolated control reproduces the legacy unprotected lost update. Other cases cover opposite two-yarn line orders without SQL deadlock 1205, simultaneous independent warehouse keys, duplicate demand, empty stock, stale pretracked layers, repeated equal-date ordering/cost formulas, FIFO/LIFO post-versus-reversal in either acquisition order, fresh stock after transient retry, final response tokens, actual index plan and negative-stock rejection for all methods.
- **Finding deferred at A6 completion, now addressed by A6R below:** WeightedAverage previously used a `Guid.Empty` cost calculation and persisted no physical `SaleCostAllocation` lineage, so reversal restored no InventoryLayer quantity. A6R replaces that characterization expectation with exact-restoration coverage and safe rejection of historical missing lineage; A6's inventory locks remain.
- A7, Phase F, transfers/shipment redesign, purchase/remittance FX, GL/accounting, UI redesign and infrastructure are not started. No entity/schema/migration/dependency/frontend/security configuration changes.
- Verification at A6 completion included prior A2/A3 security and A4/A5 token/authority regressions, all 33 new real SQL A6 cases, and zero skipped tests. SQL Server 2022 disposable databases were all removed (remaining harness databases: zero). Existing index plan and capacity tests passed with production-like SQL retries; RCSI OFF/ON capacity checks both passed. The then-deferred WeightedAverage reversal finding is now in A6R's approved scope below.

### A6R — Integrated A1-A6 Stabilization

**Status (2026-10-06): COMPLETE, independently approved and fast-forward merged into master at `add990b811b5c9216b9e5c5f3169b0a6fd03dffa`.** Implemented only on `a6r-integrated-stabilization` from clean approved A6 master `ee7861ed55b7616647f348eb82bd361c87b1884e`. All 332 backend tests pass (298 approved baseline + 32 A6R + two additional A6 WeightedAverage sale/reversal cases), zero failures/skips, including 116 real SQL tests. Non-incremental Release build: zero warnings/errors. Scope is exactly WeightedAverage physical lineage/reversal, current customer-account serialization, runtime manual-transaction retry compatibility, the three known spoofable actor identities, and A5/A6 merge-state documentation. At A6R implementation completion there was no merge or A7 work; approval/merge subsequently preceded A7.

#### A6R physical lineage and existing valuation

- Repository audit found no current report/consumer requiring WeightedAverage allocation component fields to be the acquisition costs of the exact depleted layer. The existing `SaleCostAllocation` table expresses both physical layer/quantity and valuation snapshots; no new table, schema, migration or dependency.
- WeightedAverage keeps the approved locked-available-stock weighted cost formula. Physical consumption stays FIFO by date and SQL GUID Id. Persist one allocation for each consumed layer: Id/quantity describe physical depletion; unit purchase/freight/Iranian import components describe the sale's weighted valuation, not that layer's acquisition cost. FIFO/LIFO semantics are unchanged.
- Match existing SQL precision: USD/unit snapshots use scale 6 and IRR totals scale 2. Purchase/freight averages are rounded to unit scale; the last component absorbs the component rounding residual so their sum equals the persisted total unit cost. Allocation totals are rounded separately in each currency; the last allocation absorbs only the residual to reconcile exactly with the existing persisted SaleItem USD/IRR totals. The existing item cost calculation and partner formulas remain unchanged.
- Before any reversal stock mutation, validate every sale item's positive quantity, exact sum of positive physical allocation quantities, existence of each referenced layer and matching warehouse/yarn. Missing/malformed lineage returns 409 `REVERSAL_INVENTORY_LINEAGE_MISSING` with a safe Persian message, preserving status/token and all inventory/movement/ledger/audit state. Historical pre-A6R missing lineage is never guessed or reconstructed.

#### A6R account lock and retry boundary

- `PersonAccountService.LockAccountAsync` reads the existing Person row with parameterized `SELECT * FROM [Persons] WITH (UPDLOCK, HOLDLOCK, ROWLOCK, FORCESEEK) WHERE [Id] = @person`. The existing primary key supports a narrow seek. It returns fresh nontracked persisted credit-limit data; no global lock/process mutex or account schema is added.
- Participants are Credit Sale posting, posted Credit Sale reversal, and Receipt/Payment MoneyDocument posting. Account lock precedes all inventory stock-key locks and remains held until transaction commit/rollback. Cash Sale needs no credit-account lock. Current account summary remains posted credit Sales + posted Payments - posted Receipts, read after acquiring the account lock; A5 limit/explicit override/permission contracts are unchanged.
- Audited every normal runtime BeginTransaction/UseTransaction occurrence. All five transaction paths (purchase post, sale post, sale reverse, money-document post, settlement post) now start their transaction inside the configured execution-strategy attempt. Purchase and settlement retain the original expected A4 token, clear failed tracked effects on retry, reload current roots/children, preserve validation/formulas/status rules and return the successful attempt's final database token. Both purchase HTTP callers use the returned token. Money posting uses the same pattern to hold its cooperating account lock safely under SQL retries.

#### A6R actor identity and scope

- CheckTransitionRequest contains only status/description; legacy JSON UserId has no authority. CheckOperation.CreatedBy and CheckStatusChanged AuditLog.UserId come from the authenticated NameIdentifier. MoneyDocument creation overwrites request CreatedBy. Purchases/import removes trusted form uploadedBy and derives the attachment uploader from that same authenticated identity; supplier/XLSX behavior is unchanged. Missing/malformed/empty actor IDs are rejected safely.
- The targeted frontend search found no caller for these actor inputs; no frontend change. Import signature/MIME validation, quarantine/scan, download headers and entity ownership remain A7. No new accounting, partner claims, transfers/shipment/FX, UI redesign or general refactor.
- Verification uses only the reused GUID disposable SQL harness, external process-only test connection configuration and production-like retries. The focused 32-case A6R real SQL run and full regression run both pass.

#### A6R final verification

- WeightedAverage: distinct multi-layer costs, fractional rounding, exact physical allocations/decrements, unchanged item valuation, reconciled USD/IRR totals, exact per-layer restoration and rejection of a second reversal all pass. The prior A6 tie test now repeats post/reverse for WeightedAverage too. Concurrent post/reverse passes in both stock-lock acquisition orders for all three costing methods. Seven missing/malformed lineage cases (absent allocations, wrong quantity, negative quantity, nonexistent layer, wrong warehouse, wrong yarn, another item without lineage) return the safe 409 without any reversal effects.
- Credit with different inventory keys and RCSI ON: concurrent 60+60/limit 100 yields one posted sale/debt 60 and one `CREDIT_LIMIT_EXCEEDED` Draft without effects; 50+50 both post/debt 100. Explicit authorized override permits debt 120; permission without request does not, and request without permission returns `CREDIT_OVERRIDE_FORBIDDEN`. Independent people hold locks simultaneously. Tests observe real SQL blocking across distinct connections and verify account-before-stock query order, with no SQL deadlock 1205.
- Same-person sale versus Receipt/Payment and sale versus credit reversal pass in both controlled acquisition orders. Results match valid serial executions. Receipt tests end at debt 90 or 30; Payment tests at 120 or 60, because the existing Payment operation itself has no credit-limit gate (unchanged accounting behavior). Credit reversal removes the prior posted credit sale from the existing summary under the same account lock.
- Both purchase callers pass one injected recognized transient timeout under real SQL retries: one Posted invoice, exactly the expected layers/movements/partner ledgers/audit, correct linked-order completion and final response token equal to SQL. Purchase and settlement genuine-writer races return `CONCURRENCY_CONFLICT` without posting effects. Settlement retries produce one ledger/audit and the final SQL token. Receipt/Payment retry tests also preserve the fixed token and single audit/account effect.
- HTTP tamper tests submit random/empty legacy actor IDs and verify CheckOperation.CreatedBy, check AuditLog.UserId, MoneyDocument.CreatedBy and imported Attachment.UploadedBy are the authenticated actor; supplier selection and XLSX parsing remain intact. Temporary import storage is isolated and removed.
- Full result: 332/332 pass; zero failed/skipped. A4 11/11 (5 SQL), A5 45/45 (44 SQL), A6 35/35 SQL, A6R 32/32 SQL: total 116 real SQL cases. Prior A2/A3 security coverage remains. No model/migration change. Non-incremental Release solution build passes with zero warnings/errors. Frontend is unchanged, so its build was not rerun per the package instructions. Remaining GUID test databases after cleanup: zero.
- A6R is COMPLETE with no implementation blocker. Historical sales without provable lineage deliberately remain non-reversible through this endpoint; data repair/reconstruction is not implemented. At A6R completion there was no A7, later phase, new accounting, partner-claim work or merge into master; its subsequent approved merge is recorded in the current status above.

### A7 — Attachment hardening — P0
**Status (2026-10-06): COMPLETE on `a7-attachment-hardening`.** Started from clean, fast-forwarded approved master `add990b811b5c9216b9e5c5f3169b0a6fd03dffa`. All 440 backend tests pass, including 108 A7 cases and 120 real SQL cases; zero failures/skips. Non-incremental Release build: zero warnings/errors. Frontend TypeScript/Vite build and 33 isolated compiled download-helper checks pass. No implementation blocker; no merge and A8 NOT STARTED.
- allowlist/signature validation/safe names;
- entity-level authorization;
- quarantine/scan adapter seam;
- secure download headers/audit.
**Exit:** malicious/disallowed upload tests fail safely.

#### A7 runtime file-surface audit

| Current surface | Existing caller / parent / permission | A7 treatment |
|---|---|---|
| `POST /api/attachments` | CommercePage documents; PurchaseOrder or PurchaseInvoice; `commerce.upload` | Shared bounded validation/quarantine/scanner/promotion and safe metadata DTO. |
| `GET /api/attachments` and `GET /api/attachments/{id}` | CommercePage and authenticated api.ts download helper; `commerce.view` | Supported existing parent required; direct ID cannot bypass parent checks; verified API-only download. |
| `DELETE /api/attachments/{id}` | CommercePage; `commerce.upload` | Same parent checks, existing editability, logical deletion/audit before safe physical cleanup. |
| `POST /api/purchases/import` | Existing purchase API; creates PurchaseInvoice source attachment; `purchases.create` | Shared XLSX-only validation before XlsxReader; server actor; one database save with upload audit. |
| `POST /api/commerce/orders/{id}/import` | CommercePage; existing PurchaseOrder and imported PurchaseInvoice; `commerce.upload` | Same XLSX pipeline; imported invoice/attachment/audit and original A4 order token share final atomic save. |
| `POST /api/system-backup/restore`, `POST /api/system-backup/export` | DataBackupPage; Administrator/Manager plus existing backup permissions | Audited as privileged ZIP/database restore/export surfaces; intentionally unchanged under explicit A8 exclusion. Quarantine subdirectories are not included by existing root-file-only export. Restored legacy attachments still face A7 download validation. |

- Repository searches covered IFormFile, File.Create/Open, PhysicalFile/FileStream, ZipArchive, Attachment, StoredFileName and OriginalFileName. No other runtime user-file input/return service was found. Attachment model already has SHA-256/size/uploader/timestamps; no schema change is necessary. Existing writers are generic commerce uploads and XlsxPurchaseImporter; no tracked persisted-data SQL snapshot or demo attachment seed exists to establish additional active parent types. No owner's live database was queried to invent new workflows.
- Current frontend accepts XLSX/PDF/image input and uses only public display metadata. There is no current evidence requiring GIF/WebP/SVG or any other extra format. No finance/check/sale attachment workflow is activated. Safe metadata fields need no UI adaptation; the existing Blob download helper is minimally updated to preserve canonical downloaded extensions. No UI redesign; server type detection remains authoritative regardless of the browser's picker.
- Program registers no static-file middleware and does not serve App_Data. Final and quarantine storage remain outside web root at `App_Data/attachments`; only the permission-authorized attachment API returns these documents. Backup's separately privileged archive export remains its existing operational route.

#### A7 file validation and storage contract

- One shared `AttachmentSecurityService` stages bounded bytes in a server GUID file without an extension under `App_Data/attachments/quarantine`. The same central 25,000,000-byte constant supplies all three upload/import request ceilings and the file-level limit, including actual copied length. Empty input fails 400 `ATTACHMENT_EMPTY`; excess fails 413 `ATTACHMENT_TOO_LARGE`.
- Generic allowlist: PDF (`.pdf`, application/pdf), XLSX (`.xlsx`, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet), PNG (`.png`, image/png), JPEG (`.jpg`, image/jpeg). Filename extension and browser MIME have no authority: locally valid bytes get the detected canonical type, even if advisory metadata differs. Imports require detected XLSX or fail 415 `ATTACHMENT_TYPE_MISMATCH`.
- PDF checks header/version, object/end-object, startxref and terminal EOF plausibility; PNG checks standard signature and bounded IHDR/IDAT/IEND framing; JPEG checks SOI, bounded segment/frame/scan framing and terminal EOI. This is type/structure validation, not full rendering, document sanitization or antivirus.
- XLSX must be a readable OOXML ZIP containing `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, workbook relationships and every referenced worksheet. Validate workbook content type/namespaces, root office-document relationship and internal worksheet references. Reject duplicate/case-ambiguous names, traversal/absolute/drive/backslash entry paths, unsafe worksheet targets, external worksheet targets, macro-enabled/VBA/binary payloads and unrelated embedded executable/archive parts. Current permitted non-XML parts are validated PNG/JPEG workbook media only.
- ZIP bounds derived from upload ceiling: at most 2,048 entries, 25 MB per entry/XML, 100 MB total expanded size (four times upload bound), maximum 100:1 declared expansion per entry. Read every entry through an actual bounded copy, not just declared ZIP sizes. No extraction occurs. Malformed ZIP/XML/parts and expansion abuse fail safely before XlsxReader or final promotion. XML loading in both validator and XlsxReader explicitly prohibits DTDs, sets XmlResolver=null and bounds characters; no external resource resolution.
- OriginalFileName is display-only: basename across both separator styles, Unicode NFC, control/format/CR/LF/separator/colon/quote removal, trim trailing dots/spaces, maximum 180 characters and neutral `document` fallback. Final name is exclusively random lowercase GUID + detected canonical extension; never derived from display name. Every final access validates the exact format, resolves full path under root and rejects reparse points in storage directories/files. Database-stored traversal/absolute/quarantine paths fail without filesystem access outside root.
- Pipeline: bounded quarantine write → SHA-256 → local type/structure validation → scanner adapter → final promotion → attachment and audit database save → complete file ownership. Disposable ownership cleans staging on every caught failure and the request's promoted file on parser/database/concurrency failure. Commerce's narrow before-save callback preserves its A4 atomic order version save while retaining cleanup ownership. Existing business field mapping/confirmation/posting logic is unchanged.

#### A7 scanner seam and explicit limits

- `IAttachmentScanner` returns Clean, Rejected or Unavailable. The built-in `UnconfiguredAttachmentScanner` always reports Unavailable. **No external antivirus engine/provider is configured or deployed; no network scanner call, new package or fake Clean claim exists.** Local signature/OOXML/hash checks are not malware scanning.
- `Attachments:RequireMalwareScan` defaults to false in base configuration. Rejected always fails 422 `ATTACHMENT_SCANNER_REJECTED`; unavailable or scanner failure with require=true fails closed with 503 `ATTACHMENT_SCANNER_UNAVAILABLE`; require=false allows only strict locally valid content, recording Unavailable in upload audit and safe structured logs. A real provider can later replace the narrow interface; require=true without one deliberately disables successful uploads/imports. Clean proceeds only after local validation.
- Caught request failures receive immediate cleanup. Process crash recovery/orphan reconciliation, retention and backup lifecycle are outside A7; no storage-management subsystem is introduced. Existing legacy rows/files are not silently repaired or assigned a new hash. Noncanonical legacy filenames/MIME or invalid historic bytes fail closed at download and require deliberate operational remediation.

#### A7 parent authorization, API and audit

- Parent allowlist is exactly `PurchaseOrder`, `PurchaseInvoice`. Both use existing `commerce.view` for list/download and `commerce.upload` for generic upload/delete, plus an actual parent existence check on every operation. Unsupported types fail 400 `ATTACHMENT_ENTITY_NOT_SUPPORTED`; nonexistent records fail 404 `ATTACHMENT_ENTITY_NOT_FOUND`. Direct attachment IDs load metadata and enforce supported/existing parent before any file access. Existing A2/A3 401/403 and upload rate limiting remain authoritative.
- This is current permission + supported parent authorization, not customer/partner/branch row isolation. A3's unresolved ownership rules are not guessed. Purchase import retains `purchases.create` and server-authenticated actor; commerce import retains `commerce.upload` and its existing order/token/supplier/business guards.
- Delete retains Draft-only PurchaseInvoice and SubmittedToCommerce/InCommerce-only PurchaseOrder editability. Upload does not acquire new post-status restrictions. Remove metadata and append deletion audit atomically before physical cleanup; a cleanup failure logs safely and leaves no downloadable record.
- Upload/list and Commerce.OrderWorkbench return the same `AttachmentMetadata` DTO: useful parent/document/display/size/time/uploader fields only; no StoredFileName, filesystem/quarantine path, scanner internals or unused hash. Frontend already uses these fields; no metadata/UI redesign is required.
- Download validates safe path/existence, canonical stored MIME, maximum/recorded size, SHA-256 match, and local detected content against canonical extension, including legacy files. Tampering fails 409 `ATTACHMENT_INTEGRITY_FAILED` and emits a safe structured event; missing physical file fails 404 `ATTACHMENT_FILE_NOT_FOUND`. The verified read handle is returned directly, with write sharing disabled, avoiding a hash-then-reopen window. No stored hash is rewritten.
- Download forces encoded `Content-Disposition: attachment`, canonical MIME, `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`. Display filenames are sanitized again for corrupt/legacy metadata and the download extension comes from the verified server storage type, preventing executable/script display extensions from surviving on the downloaded file. Frontend api.ts Blob downloads prefer encoded server disposition and retain the canonical MIME extension even when CORS hides that header; fallback display metadata cannot choose a dangerous extension. Unknown response MIME fails safely. No inline preview, public static path or UI redesign.
- `AttachmentUploaded`, `AttachmentDownloaded`, `AttachmentDeleted` AuditLog entries use authenticated ClaimsPrincipal actor only. Imported source workbooks use the same canonical metadata/upload audit. Safe event metadata is attachment/parent ID, canonical MIME, size, hash and upload scan category; never raw bytes, full paths, tokens or scanner internals. Scanner/integrity failures use safe structured logs.
- No entity/schema/index/migration or dependency changes. No financial/inventory/credit/retry/RowVersion redesign, new parent workflows, backup hardening, A8 or later phase. Existing SQL regression suite remains required before completion.

#### A7 verification

- Initial focused run: 93/93 pass. Expanded run: 100/104 pass; the four real SQL fixture failures were missing RequestedByUserId setup, fixed solely in test data; all four SQL cases then pass. First full backend run: 436/436 pass. After canonical download filename refinement, **final full run: 440/440 pass, zero failed/skipped/not-executed; A7 108/108 (four real SQL)**. All required malicious/disallowed/unauthorized upload/import/download cases fail safely. Supported uploads/imports, scanner categories/require behavior, quarantine/save/parser cleanup, safe DTO/headers/names/hash, parent validity/permissions/immutability and actor-correct audits pass.
- Real SQL regressions: A4 11/11 including five SQL; A5 45/45 including 44 SQL; A6 35/35 SQL; A6R 32/32 SQL; A7 four SQL. **Total 120 real SQL cases** using the existing protected process-only GUID database harness; no owner database or committed credentials. New SQL cases prove generic and both import lifecycle/audits plus a genuine late commerce-order RowVersion conflict rolling back invoice/attachment/audit and removing the promoted file. Existing token, posting authority, stock/credit locks, retry and actor regressions all pass.
- Final cleanup verification: zero GUID SQL test databases, zero A7 temporary directories, zero A6R import temporary directories. Temporary frontend verification output/script removed; ignored test-result reports remain available. No schema/migration/dependency changes or unrelated business fixes. A7 exit criterion is satisfied; A7 COMPLETE, pending independent review/merge; A8 NOT STARTED.
- Final non-incremental Release build: zero warnings/errors. Frontend TypeScript check and Vite production build pass. Additional 33 checks against compiled api.ts, with mocked fetch/DOM and no network calls, verify four canonical MIME types, dangerous display extensions, traversal/control sanitation, Persian encoded disposition, CORS-header fallback and rejection of unexpected MIME. These are download-helper checks, not a claim of a live production browser/antivirus test.

### A8 — Backup/restore production hardening — P1
**Status: NOT STARTED.**
- separate runtime vs backup privileges;
- encryption/offsite/schedule strategy;
- restore drill;
- maintenance procedure.
**Exit:** documented tested restore.

### A9 — Baseline automated tests and CI build — P1
- backend unit/integration test projects;
- frontend build/typecheck;
- migration validation.
**Exit:** repeatable green baseline before domain expansion.

---

## PHASE B — Correct the procurement/shipping model

### B1 — PO lifecycle and supplier invariant
- one supplier per PO;
- explicit statuses;
- cancellation/change approval after commitment;
- supplier acceptance evidence.

### B2 — Proforma
- attach original proforma;
- structured key fields;
- supplier/product price history;
- price lock after confirmed proforma except audited manager exception.

### B3 — Shipment/loading domain
- Shipment / Container / ContainerLine;
- Chinese English workbench;
- partial shipment;
- open-order matching by supplier + product, oldest-first suggestion;
- PO line fulfillment quantities.

### B4 — Shipment documents and in-transit
- B/L, packing list, supplier invoice, partner invoice, images, ETA, freight payer/cost;
- status/location timeline;
- attachments linked and authorized.

### B5 — Receipt and discrepancy
- warehouse receipt;
- actual quantity;
- discrepancy;
- return/exception feedback to procurement;
- PO completion based on meaningful remaining quantity/tolerance.

**Phase B exit:** a PO can travel cleanly from order through partial China loading to receipt with traceability.

---

## PHASE C — Inventory, origin lots, FIFO, transfers, costing

### C1 — OriginLot + warehouse layer lineage
- introduce stable `OriginLotId`;
- bridge current PurchaseInvoiceItem/container data;
- preserve original receipt/import date.

### C2 — Append-only inventory ledger
- normalize source-document/source-line/origin-lot references;
- reversal/adjustment patterns;
- Kardex-ready indexes.

### C3 — Warehouse-specific FIFO finalization
- FIFO only for profit/cost;
- weighted average only for management valuation where required;
- special lot selection exception with permission/reason.

### C4 — Two-step warehouse transfer
- approval;
- dispatch to transit;
- destination confirmation;
- discrepancy resolution;
- origin/cost lineage preserved.

### C5 — Landed cost
- allocation by relevant weight + CBM proposal;
- manual override with reason;
- provisional/final/reopen;
- payer determines creditor;
- IRR company costs converted to USD at approved payment-date rate;
- Chinese CNY→USD purchase conversion frozen at partner invoice event.

### C6 — Inventory reporting baseline
- current balance summary optimized for fast report;
- detailed movement retained;
- no duplicate parallel reporting tables unless justified as controlled projection/cache.

**Phase C exit:** stock, FIFO, transfer, cost and Kardex are reliable enough for sales.

---

## PHASE D — Sales

### D1 — Product-group price inheritance
- group hierarchy;
- cash/credit price;
- effective validity;
- sales-center/customer constraints.

### D2 — Sale/outbound workflow
- order/release → warehouse preparation → manager release → physical outbound → final invoice;
- decide exact document split before coding UI.

### D3 — Provisional pricing
- outbound allowed;
- final invoice blocked until price confirmed;
- accounting worklist;
- individual confirmation, no bulk finalization.

### D4 — Credit controls
- customer limit;
- sales-center limit if enabled;
- risky/blocked customer: credit blocked, cash allowed;
- override through permission/approval.

### D5 — Stock/clearance sale classification
- robust workflow plus anomaly detection;
- suspicious sale excluded from replenishment demand until confirmed.

### D6 — Sales return
- physical return + financial return;
- original FIFO cost lineage;
- reverse partner claim/commission as appropriate.

**Phase D exit:** sales cannot corrupt inventory/cost/credit state.

---

## PHASE E — Receivables, checks, sales-center account

### E1 — Receipt and invoice allocation
- cash/check;
- explicit invoice links;
- oldest-first default;
- excess as customer credit.

### E2 — Check custody ledger
- one check identity;
- handoff/acceptance;
- physical signed evidence when recipient is outside system;
- status history.

### E3 — Bounce/return
- center becomes debtor according to final owner decision;
- notifications;
- configurable deadline/late charge.

### E4 — Commission
- sale recognition;
- proportional reversal on return;
- payment/offset;
- returned-check offset only against actual remaining amount.

### E5 — Simple sales-center operational account
- receivable/customer balance;
- due to company;
- commission receivable;
- no full GL.

---

## PHASE F — Partner & FX
**Do not begin financial coding until the Owner Decisions in section 12 are resolved and numeric scenarios are approved.**

### F1 — Partner contract version
- effective-dated rules;
- immutable historical linkage.

### F2 — Partner capital view
- unsold inventory at actual historical cost;
- partner/company shares;
- in-transit shown separately.

### F3 — Partner claim lifecycle
- principal/profit/credit premium components;
- created → scheduled → payable → converted/settled;
- return/reversal.

### F4 — Claim maturity and bounced-check rules
- configurable grace;
- company collection risk behavior.

### F5 — Debt discounting
- immediate liquidity effect;
- discount cost allocation by contract;
- original bounce risk rule.

### F6 — Exchange-house dual-currency wallet
- IRR balance;
- USD balance;
- actual immutable FX purchase rate;
- partner IRR claim converts when USD is purchased, not when remitted.

### F7 — Remittance
- separate from FX purchase;
- partial/over-remittance;
- partner can become debtor;
- statement/reconciliation.

**Phase F exit:** all approved numeric scenarios reconcile exactly.

---

## PHASE G — Insight, reporting and replenishment

### G1 — Inventory master-detail
Top cards:
- warehouse weight/value;
- in-transit weight/value;
- total.

Main product grid + linked:
- color breakdown;
- warehouse breakdown;
- maximize/restore;
- drill to Kardex;
- exact reconciliation.

### G2 — Warehouse/container/aging reports
- warehouse master-detail;
- container consumed/remaining;
- current computational container consumption until package tracking;
- aging buckets.

### G3 — Sales ranking/trend
Priority:
1. USD amount;
2. weight.
Growth/decline, no movement, profitability, dormancy.

### G4 — Coverage and stockout risk
- current stock;
- in-transit;
- open PO without double count;
- supplier lead time;
- arrival-too-late warning.

### G5 — Replenishment recommendation
Demand:
- selectable historical window;
- only in-stock days;
- returns neutralized;
- clearance/anomalies excluded unless confirmed;
- trend adjustment;
- rank-based configurable safety factor;
- target horizon/lead time.

### G6 — Actionable recommendation
- select rows;
- create editable PO drafts;
- group selected items by supplier because one PO = one supplier.

### G7 — Partner/management dashboards
- partner capital;
- claims maturity;
- FX risk;
- check risk;
- profit provisional/final;
- permission-filtered bilingual views.

---

## PHASE H — Import/export, notifications and polish

### H1 — Shared import/export engine
- Excel first;
- reusable mapping/validation/error report;
- XML adapter supported by architecture and implemented where actually required;
- exports obey privacy/data scope.

### H2 — Notification layer
- in-app first;
- channel abstraction for later SMS/WhatsApp/email/other channels;
- no business logic tied to one provider.

### H3 — Reference-form UX standard
Before coding each major form, finalize:
- fields/order/layout;
- required/defaults;
- validation;
- statuses/actions;
- permissions;
- grid/search/filter;
- print/export;
- Tab/Enter/focus;
- keyboard workflow;
- autocomplete.
First approved operational form becomes the reference form; changes are versioned.

---

## PHASE I — Production readiness / go-live

- security review against current OWASP ASVS controls relevant to the app;
- dependency vulnerability review;
- production TLS/certificate;
- firewall/network segmentation;
- no public SQL port;
- least-privilege service identity;
- encrypted/tested backup;
- logging/alerting;
- DB integrity/maintenance jobs;
- performance/load test with representative data;
- restore drill;
- initial-data migration and reconciliation;
- user/role/data-scope verification;
- incident/rollback procedure;
- owner sign-off.

---

# 11. Performance principles

- Server-side pagination/filtering.
- Never load huge grids into browser.
- Keep detail ledger; maintain only justified current-state summaries/projections.
- Use `AsNoTracking` for read-only EF queries.
- Avoid N+1 queries.
- Index based on real query plans.
- Use Query Store.
- Hot posting paths favor correctness first, then measured optimization.
- Do not cache authorization in a way that leaves revoked permissions active too long.
- China partner experience must remain responsive over higher latency: coarse APIs, pagination, compression, avoid chatty screen loads.
- Attachments should not travel through list APIs as blobs.

---

# 12. OWNER DECISIONS REQUIRED

These are business decisions. Codex must not invent them.

1. **FX risk between sale and USD purchase:** Chinese partner or company?
2. **Primary debtor for commission sales center transactions:** sales center or anonymized end customer?
3. **Accounting boundary:** accounting-document export only (recommended current direction) or internal GL?
4. **Partner claim maximum wait after customer maturity/nonpayment:** exact number of days?
5. **Inventory loss/shortage/damage bearer:** partner capital, company, supplier, or rule by cause?
6. **Supplier payment / partner participation:** contract percentage per shipment or based on actual payments?
7. **Remittance recognition point:** sent, confirmed received, or another rule?
8. **Initial go-live date and opening-data sources:** stock, open PO, in-transit, receivables, checks, partner/exchange-house balances.
9. **Exact sale document model:** whether delivery order and invoice are separate operational documents.
10. **RESOLVED (2026-10-06) — Final authentication owner decision:** private/invite-only; Administrator-only account creation and login-email changes; users cannot self-register, add another login email or self-change email. Initial password through a protected, expiring, single-use invitation. Production login for every normal user is email/password plus email device verification unless the browser has valid server-issued trust of at most 30 days. OTP goes only to the Administrator-registered email. TOTP is not selected; Passkey/WebAuthn may be considered later. Local owner testing explicitly enables Development-only loopback auto-login with real roles/permissions, no password/OTP/SMTP, and no Production fallback. This supersedes the earlier pending/TOTP proposal.
11. **TDE availability/licensing/operations:** confirm production SQL Server edition and chosen at-rest encryption strategy.

---

# 13. Deferred future capabilities — architecture seam only

Do not implement now unless separately approved:
- package/bale-level barcode;
- package weight and exact physical FIFO;
- packing-list → package creation;
- scan-based inbound/outbound;
- advanced loss/damage responsibility workflow;
- external notification providers;
- advanced anomaly/ML recommendation engine.

Future package seam:
`Package(Id, Barcode, Weight, OriginLotId/ContainerLineId, CurrentWarehouse/State...)`
and optional `PackageId` reference in movement/allocation model when implemented.

---

# 14. Definition of Done for every Codex work package

A work package is DONE only when:
- scope is exactly the requested item;
- build passes;
- relevant tests pass;
- migration is reversible/reviewed where applicable;
- security/data-scope impact reviewed;
- no new secret committed;
- no unexplained duplicate table/service/abstraction;
- performance-sensitive query has appropriate index consideration;
- API backward compatibility considered;
- this master file updated;
- Change Log updated;
- next dependency/blocker identified.

---

# 15. Change Log

## 2026-10-08 — Persons nationality and default language (Step 5)
- Changing nationality to IR (Iranian) sets the editable language to `fa`; CN (Chinese) sets it to `zh`. English remains a manual alternative; all nationality options and the Persian/English language options remain available. Other nationality changes preserve the current language. Loading an existing record preserves its stored language, including an existing Chinese person with English selected.
- Persons API accepts and persists `fa`, `en`, and `zh` through the existing preferred-language string and create/update/read paths. No schema change or historical rewrite is required.
- Verification: four focused InMemory controller tests pass for create/reopen and manual English/Chinese updates; frontend TypeScript check passes. The real form check confirms CN→Chinese, manual English, IR→Persian, and Other preserving manual English. No person record was saved by the UI check; the API was rebuilt/restarted and its health endpoint returned HTTP 200.

## 2026-10-06 — A7 attachment hardening
- Implemented only `a7-attachment-hardening` from approved merged A6R master `add990b811b5c9216b9e5c5f3169b0a6fd03dffa`. Audited every runtime user-file surface, including separately deferred privileged backup/restore. Added one shared bounded local file/OOXML validator, quarantine/SHA-256/canonical storage, explicit optional scanner seam and request-owned cleanup, reused by generic uploads and both XLSX imports.
- Supported parents are existing PurchaseOrder/PurchaseInvoice under existing commerce view/upload permissions; no guessed ownership or new finance/check workflows. Direct IDs enforce parent checks. Safe metadata DTO, verified same-handle downloads, encoded canonical download names/headers and authenticated upload/download/delete audits close the current bypasses. Commerce import retains its original A4 atomic order save and cleans files on a genuine SQL conflict. One existing frontend download helper is updated; no UI redesign.
- Verification: 440/440 backend tests pass, including 108 A7 and 120 real SQL cases; zero failures/skips. Non-incremental Release build: zero warnings/errors. Frontend TypeScript and Vite production build pass; 33 isolated compiled helper checks pass with no network calls. GUID SQL/temporary directories are removed. No schema/migration/dependency/secrets or financial/inventory/business-rule changes.
- A7 COMPLETE; no external antivirus is deployed (built-in result Unavailable, RequireMalwareScan=false baseline, true fails closed). Local validation is not antivirus. A6R's approved merge status is recorded above. No merge of A7, no A8 or later phase.

## 2026-10-06 — A6R integrated stabilization
- Started only `a6r-integrated-stabilization` from approved A6 master. Reused allocation lineage, added Person account serialization to current balance-changing posts/reversal, made purchase/settlement transactions retry-safe with fixed A4 tokens, and removed client actor authority in the three known routes.
- Updated current A5/A6 merge states; retained their historical verification facts. No migration/new table/dependency/frontend change or A7 work.
- Verification: 332/332 backend tests pass, zero failures/skips; 116 real SQL cases (5 A4 + 44 A5 + 35 A6 + 32 A6R). WeightedAverage restores exact layers with unchanged valuation; historical/malformed lineage fails atomically. Different-stock credit 60+60/100 permits one, 50+50 permits both, authorized explicit override alone permits the excess. Same-account receipt/payment/reversal operations serialize correctly with RCSI ON. Purchase/settlement/money retries retain original tokens and single effects; spoofed actor inputs have no authority.
- Non-incremental Release build: zero warnings/errors. Frontend unchanged, no rebuild required. GUID SQL databases and temporary import storage are removed. A6R COMPLETE; no merge into master and A7 NOT STARTED. Historical missing lineage is safely rejected, never guessed.

## 2026-10-06 — A6 SQL inventory concurrency locking
- Implemented only `a6-inventory-concurrency` from approved A5 master `978e7a8d231e48dc3d6282548719a93d74821b33`. Indexed parameterized UPDLOCK/HOLDLOCK stock-key reads, SQL-compatible deterministic key/layer ordering, aggregate demand validation and exact locked-row allocation protect FIFO, LIFO and WeightedAverage posting in the existing atomic transaction.
- FIFO/LIFO reversal restores layers through the same ordered locking boundary. Configured transient retries reacquire fresh stock while preserving A4's original Sale token, and post/reverse responses return the final database token. A5 authoritative financial inputs/formulas are preserved. No index migration, dependencies, frontend changes or unrelated modules.
- Verification: 298/298 backend tests pass (265 existing + 33 A6), zero failures/skips; 82 real SQL cases (5 A4 + 44 A5 + 33 A6). Stock 10 with concurrent 7+7 yields one winner/final 3; 5+5 yields both winners/final 0, for all costing methods and RCSI OFF/ON. Opposite two-yarn input orders and FIFO/LIFO post-versus-reversal in either acquisition order complete without deadlock 1205. Independent stock locks coexist; ties/formulas, retry freshness, negative invariants and actual indexed seek plan pass.
- Non-incremental Release solution build: zero warnings/errors. Frontend typecheck/production build: pass, unchanged source. GUID test database cleanup verified: zero remaining. No secrets/test connection string are committed.
- A6 is COMPLETE and subsequently approved/merged into master at `ee7861ed55b7616647f348eb82bd361c87b1884e`. Its then-deferred WeightedAverage reversal lineage finding is addressed by A6R above; A7 was not started.

## 2026-10-06 — A5 server-authoritative sale posting
- Created `a5-server-authoritative-posting` from approved A4 master `d9c07409b19375436190e26e33b77585dcdc8ae4`; subsequently approved and merged into master, including the retry-response correction at `978e7a8d231e48dc3d6282548719a93d74821b33`.
- Removed rate/method/tolerance and client confirmation authority from the posting DTO and public service signature. The service resolves the exact final positive sale-date USD→IRR rate and latest effective existing settings, overwrites schedule/item/root snapshots and calculates partner ledgers using existing server rules.
- Added only `sales.creditOverride`, retained every prior operational default, and required effective permission plus an explicit request only when the existing projected-debt calculation exceeds the customer limit. The existing audit log records safe authority metadata and the authenticated approver atomically with posting.
- Retained A4's token contract and original expected version through SQL transient execution. Purchase posting, financial formulas, layer selection ordering, schema/migrations, frontend and security architecture are unchanged.
- Verification: 262/262 backend tests pass (220 existing + 42 A5; five A4 and 41 A5 real SQL cases; zero failures/skips). Non-incremental Release build: zero warnings/errors. Test databases use the reused A4 GUID harness with automatic cleanup and process-only protected configuration. No credentials or test connection strings are committed; no frontend build was needed.
- A5 is COMPLETE and subsequently approved/merged into master. At A5 completion, A6/A7/Phase F/FX remittance/GL/UI redesign had not started and inventory allocation concurrency remained pending. A6 is now complete and merged; A7 has not started.

## 2026-10-06 — A4 real SQL rowversion and optimistic aggregate concurrency
- Created `a4-rowversion-concurrency` from clean, fast-forwarded master containing approved A3 commit `f933fff8d844660704dc3fd844a4aba76a8f38e5`; subsequently approved and fast-forward merged into master at `d9c07409b19375436190e26e33b77585dcdc8ae4`.
- Audited all 16 current audited types, enabled database-generated rowversion and added only `20261006141731_FixSqlRowVersionConcurrency`. Up/Down replace token columns while preserving business data; old migrations and unrelated model/Identity metadata are unchanged. Removed explicit generated-token seed values and preserved applied seed dates/business values.
- Added one consistent Base64 query-token contract across existing aggregate edits/deletes/state actions, standard 400/409 responses, new-token success responses and root protection for child-only changes. Preserved existing status rules, permission metadata and posting calculations. Commerce import database writes now share the final atomic save with its order version check.
- Updated only current UI mutation callers to retain/send/refetch tokens and show concurrency conflicts; no automatic stale replay, merging, UI redesign or new runtime dependency.
- Verification: all 220 backend tests pass (209 existing + 11 A4; five real SQL Server integration cases, zero failures/skips). Real SQL migration-path preservation/rollback/reapply, generated eight-byte tokens, two-context stale EF exception, authenticated stale/current update, stale delete, child-only edits, remaining command gates and after-read race handling pass. Non-incremental Release build: zero warnings/errors. Frontend typecheck and production build: pass. Test databases are disposable GUID-named databases, isolated from the owner's normal database; no connection string or credentials are committed.
- A4 exit criterion is satisfied and A4 is COMPLETE. A5/A6/A7 have not started. Client-authoritative sale inputs remain A5; concurrent FIFO allocation/oversell remains explicitly pending for A6. Rowversion does not replace inventory locking.

## 2026-10-06 — A3 explicit policy-based authorization
- Created `a3-policy-authorization` from clean, fast-forwarded master containing approved A2 commit `010e8b5f8658b35a1b280b903a4308398507e083`.
- Removed route-derived `PermissionGuardMiddleware`; added explicit built-in authorization requirements, provider, handlers, default-deny classification and startup/metadata coverage validation. Audited every existing endpoint and recorded the full mapping in section 7.2.2.
- Retained the central catalog, role defaults, user overrides, A2 authentication and sensitive role restrictions. Added only request-scoped effective-permission reuse and a small own-user data-scope seam. Closed the work-item start-action path around `commerce.accept` without changing workflow transitions.
- Recorded undefined ownership/isolation decisions rather than inventing them. Attachment entity checks remain A7; backup lifecycle remains A8. No migration, dependency, frontend change or A4 implementation was included in A3. A3 was subsequently approved and fast-forward merged into master.
- Verification: all 209 backend tests pass (137 existing plus 72 A3 cases; zero failures/skips), including real HTTP 401/403/grant/revocation cases, role restrictions, view-versus-write separation, own-account/work-item scope, request-only caching, 14 role-default snapshots and classification failure when an endpoint's permission is forgotten. Non-incremental Release solution build: zero warnings/errors. Tests target net8.0 using the installed .NET 10 runtime via the existing major-roll-forward/TestHost compatibility setup. No frontend files changed, so no new frontend build is required.
- Actual Production entry-point startup/metadata validation succeeds with non-secret smoke configuration: health 200, protected report 401 and development-session 404. Framework-generated method/content-type rejection responses remain unchanged; the existing A2 unavailable-public-account-route test passes. The sandbox cannot decrypt/persist the machine's Windows Data Protection keys; this anonymous entry-point check does not claim a live Production login, SMTP delivery or SQL-backed posting test. Authenticated HTTP tests use isolated ephemeral keys, a fake sender and EF InMemory; no business posting/concurrency verification is claimed for A4/A6.
- A3 exit criterion is satisfied. The approved branch was subsequently merged into master at `f933fff8d844660704dc3fd844a4aba76a8f38e5`; A4 had not started at A3 completion. Undefined customer/center/partner isolation and attachment entity authorization remain the explicitly recorded security limitations for later approved work.

## 2026-10-06 — A2 final owner decision: private invitation and email browser verification
- Continued the existing `a2-auth-security-baseline` branch from a clean working tree and fast-forward pull; no new branch or merge. The owner decision supersedes the earlier method-pending baseline below.
- Replaced public MapIdentityApi routes with the necessary private login/verify/resend/refresh/activation/recovery/read-only info routes. Public register, email-change and authenticator-management surfaces are unavailable. Administrator alone creates users/changes email, reissues pending invitations or explicitly revokes account sessions/trust. Administrator permanent-password input is rejected; the invited user sets their own password.
- Invitation default 24 hours and recovery default one hour use Identity reset tokens inside purpose-bound, expiring Data Protection envelopes; tokens travel in URL fragments cleared by the frontend. Successful password creation/reset or reissue invalidates previous links. Pending users cannot log in.
- All normal users require password plus registered-email verification on an untrusted browser. Existing Identity email provider supplies codes; stored challenge metadata contains nonce/stamp/deadline/budgets, never OTP. Attempts are reserved using Identity concurrency updates and consumption is saved before session issuance. Resend rotates the nonce with a 60-second cooldown, at most five sends/five attempts and no deadline/budget extension. Authentication/invitation endpoints retain configurable rate limiting.
- Identity remember-client cookies use secure strict HttpOnly protection, fixed maximum 30 days and immediate security-stamp validation without principal renewal. Application cookies preserve the session claim with a fixed one-hour default. Existing Identity token rows hold random session IDs/deadlines; refresh rotates the session, logout revokes only the current session, and expired session rows are removed on subsequent session issuance. Security changes invalidate every old session/browser trust.
- Added a minimal built-in SMTP sender with external credentials, TLS requirement outside Development, bounded send timeout and safe delivery failure behavior. Production rejects missing configuration before listening. Recovery remains neutral on send failure. Fake sender tests never deliver real email; no live SMTP delivery claim.
- Added explicit Development-only local Administrator auto-login and a development-build-only frontend probe. Base flag is false; Development file opts in. Guards check actual loopback, local Host/Origin, reject forwarded headers/remote proxy peers and recheck development sessions on use. Vite overwrites peer metadata from its socket; runapp scripts now align local port 5223/5173. Non-Development flag activation fails startup; Production endpoint returns 404; environment Data Protection purposes prevent cross-environment token use.
- Updated only login/user-security frontend forms, scoped authentication/API/controllers/settings/tests, README, run scripts and Master. No schema migration, runtime dependency, financial/person/business module or route-permission redesign. A3 was not started.

Verification: 137/137 backend tests pass (61 existing + 76 security cases); no skipped tests. Tests use net8.0 with installed .NET 10 major roll-forward, TestHost response stream compatibility and isolated ephemeral Data Protection. Non-incremental backend Release solution build passes with zero warnings/errors. Frontend production build and TypeScript check pass; the produced JavaScript contains no automatic development-session endpoint. Focused HTTP tests cover Development enabled/disabled/loopback/IPv4-mapped loopback/LAN/proxy denial and real Administrator access; Production cannot enable the bypass. Actual Release entry-point Production smoke checks, with non-secret dummy SMTP/SQL configuration and no email/database operations, return health 200, protected report 401, development endpoint 404, invalid Host 400, plain HTTP 308, and HSTS max-age=2592000 behind an explicitly trusted local proxy. Actual unsafe startup checks reject DevelopmentAutoLogin outside Development and missing SMTP. No live SMTP delivery or live SQL-backed browser smoke is claimed. No migration is required; existing user passwords remain intact and existing sessions must reauthenticate under the new private contract. A2 is COMPLETE; no implementation blocker remains. Deployment credentials, persistent Data Protection keys and actual SMTP/SQL connectivity still require normal environment configuration. A3 was not started.

## 2026-10-06 — A2 authentication/internet security baseline, MFA decision pending
- Started from clean `master`, pulled `origin/master` with fast-forward only, and created `a2-auth-security-baseline`.
- Reused Identity opaque bearer tokens, cookie support and its existing second-factor/recovery facilities. Added `/api/auth/mfa-status` with the required-role baseline (Administrator/Manager/Partner, extensible for external roles), explicit pending-method status and no claim that enforcement is active. Owner decision 12.10 still blocks full MFA completion.
- Added configurable fixed-window rate limits without queues: authentication/recovery/MFA 30/minute per trusted client IP; uploads/imports 20/minute per user; reports 60/minute per user; backup/restore 2/5 minutes per user. Ordinary business edits and heartbeat are unaffected. Limits are per API instance.
- Production now requires exact AllowedHosts and HTTPS CORS origins, rejects unsafe SQL/migration/seed/security configuration, redirects HTTP to HTTPS, uses 30-day HSTS and trusts forwarded scheme/IP only from explicitly configured proxy IPs. Host forwarding is disabled. Private SQL/network/certificate deployment requirements are documented; no infrastructure was created.
- Added generic ProblemDetails with trace IDs, safe structured exception/auth-event logs, production raw framework exception/SQL log suppression, no-store/nosniff/no-referrer headers, and sanitized backup error responses.
- Set bounded token/cookie lifetimes (60-minute access/application cookie, 24-hour refresh, 5-minute temporary cookies), secure strict HttpOnly cookies and CSRF for optional cookie writes/login. New/changed passwords require 12 characters; lockout defaults to 5 failures/10 minutes.
- Active/lockout/security-stamp checks now apply to authenticated requests and refresh. Logout revokes all sessions for that account; password changes/resets, role/email changes and deactivation invalidate existing access. The existing frontend Bearer integration and route-derived permission middleware are preserved.
- Added focused HTTP/Identity security smoke tests. Test-only dependencies are ASP.NET Core TestHost and EF Core InMemory; no runtime dependency was added. Tests cover configuration rejection, 401/429, endpoint limit placement and per-user partitions, safe errors/logs, restrictive hosts/CORS, HTTPS/HSTS/proxy trust, MFA readiness/second-factor/recovery, lockout, CSRF/cookie behavior and token revocation/refresh.

Verification: 104 backend tests pass (61 existing + 43 security tests), with net8.0 tests using the installed .NET 10 runtime via major roll-forward; the test harness uses the installed runtime's response stream writer for TestHost compatibility and isolated ephemeral Data Protection keys. The non-incremental backend Release solution build succeeds with zero warnings/errors. An actual local Production-mode entry-point smoke check with non-secret test configuration returned health 200, protected report 401, invalid Host 400 and HTTP redirect 308, with HSTS behind the trusted proxy; missing production host/security configuration fails before listening. The restricted Windows Event Log initially prevented the local process from starting, and the authorized unrestricted local run passed. No live SQL Server transaction/deployment test is claimed. Frontend is unchanged, so a new frontend build is not required. A2 remains PARTIAL pending MFA selection/enrollment/enforcement; A3 was not started.

## 2026-10-06 — A1 repository hygiene/configuration hardening
Implemented within Phase A1:
- safe base API settings; no tracked SQL connection string or default admin password;
- Development-only seed and auto-migration, with the admin password required from .NET User Secrets;
- non-Development startup requires protected SQL configuration with encryption and certificate validation, and rejects auto-migration/seed;
- `.gitignore` covers local env files, build outputs, local database files, backups, and attachments;
- removed the hard-coded LAN HTTP frontend production URL and documented `VITE_API_URL` / `VITE_API_PROXY_TARGET`.

Verification: frontend production build succeeded; backend Release solution build succeeded; 61 backend tests passed using the installed .NET 10 runtime's major roll-forward for the net8.0 test host. Production startup smoke check safely failed when the required SQL connection configuration was absent, as intended. Final A1 verification confirmed the project/Master root at `C:\project\yarn-trade-system`, a single Master copy, no unignored artifacts or literal default credentials, and successful non-incremental backend and frontend rebuilds. No Git repository exists in the project directory or its parents; Git tracking/history checks are an environment/repository-state limitation rather than an implementation failure. A1 is marked COMPLETE for the source snapshot. A2 was not started.

## 2026-10-04 — v1.0
Created the root living reference after reviewing:
- current backend source;
- current frontend source;
- current SQL database/index script;
- approved 7-module Big Picture direction.

Recorded immediate blockers:
- production secrets/config;
- route-derived authorization;
- upload security;
- fake/non-database-generated RowVersion;
- concurrent FIFO sale race;
- client-authoritative financial posting inputs;
- internet deployment hardening.

Established phased roadmap A→I and mandatory living-document protocol.

---

# 16. Security references used for this baseline

These references are guidance, not a requirement to implement every enterprise feature.

- OWASP Application Security Verification Standard (ASVS), current project guidance.
- Microsoft Learn — SQL Server Security Best Practices.
- Microsoft Learn — Secure SQL Server.
- Microsoft Learn — SQL Server Row-Level Security.
- NIST SP 800-63-4 — Digital Identity Guidelines.
- NIST SP 800-63B-4 — Authentication and Authenticator Management.

When security guidance changes materially, update this section and the affected roadmap item.
