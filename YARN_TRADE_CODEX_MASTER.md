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
Current `PermissionGuardMiddleware` infers permissions from URL/method patterns. This is brittle and can fail open for new or changed endpoints.

Required correction:
- use endpoint authorization policies/attributes/requirements as the authoritative authorization layer;
- permission names remain centralized;
- enforce both **action permission** and **data scope** server-side;
- frontend menu hiding is UX only, never security;
- every new endpoint must declare its authorization requirement explicitly;
- partner/sales-center data scope must be enforced in query/service layer.

Consider SQL Server RLS only as defense-in-depth for selected high-risk scope boundaries after the application data-scope model is stable; do not use RLS as a substitute for application authorization.

## P0-03 — File upload/download security is insufficient
Current attachment upload:
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
- MFA is required for administrators/managers and should be available for all users; partner/external access should use MFA.
- Prefer phishing-resistant MFA where practical for privileged accounts.
- Strong password policy plus breached-password screening where feasible.
- Lockout/throttling must resist brute force without enabling easy denial-of-service.
- Password reset and account recovery are audited.
- Disable inactive users immediately.
- No shared administrator accounts.
- Session/token lifetime appropriate to role and risk.
- Sensitive operations may require recent re-authentication.

Reference basis: NIST SP 800-63-4 / 800-63B-4.

## 7.2 Authorization
- deny by default;
- endpoint policy + data scope;
- least privilege;
- privileged actions separated from ordinary edit rights;
- approvals cannot be bypassed by direct API calls;
- exports obey same row/field scope as screens;
- partner portal can only see explicitly permitted business objects.

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
- MFA design/implementation for privileged and external users;
- rate limiting;
- HSTS/HTTPS/reverse proxy config;
- exact CORS/host rules;
- production error handling/logging;
- token/session review.
**Exit:** security smoke tests pass.

### A3 — Replace route-derived permissions — P0
- endpoint policy-based permission requirements;
- central permission catalog retained;
- introduce explicit data-scope abstraction;
- migrate existing endpoints;
- security tests.
**Exit:** no business endpoint depends on URL inference as its sole authorization.

### A4 — Fix RowVersion/concurrency model — P0
- SQL `rowversion`;
- conflict handling;
- migrate mutable aggregates.
**Exit:** stale update test returns conflict.

### A5 — Make posting inputs server-authoritative — P0
- sale USD rate resolved from approved exchange-rate record;
- costing method/tolerances from effective settings;
- credit override requires explicit permission/approval;
- remove authoritative financial values from client post request.
**Exit:** tampered client request cannot alter authoritative cost/rate.

### A6 — Fix FIFO concurrent sale race — P0
- transaction/locking strategy;
- deterministic FIFO ordering;
- concurrent integration test.
**Exit:** oversell/double-consume impossible under tested concurrency.

### A7 — Attachment hardening — P0
- allowlist/signature validation/safe names;
- entity-level authorization;
- quarantine/scan adapter seam;
- secure download headers/audit.
**Exit:** malicious/disallowed upload tests fail safely.

### A8 — Backup/restore production hardening — P1
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
10. **MFA method for external/privileged users:** TOTP/passkey/other supported method.
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
