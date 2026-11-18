# Security Specification (Phase 2: Identity, Organization, Branch, RBAC, Audit)

## 1. Data Invariants
1. Unauthenticated or unverified users (`email_verified != true`) are denied all read/write access across every business collection.
2. No user may assign themselves a `super_admin` or `owner` role inside an existing organization, nor change their own `role`, `permissions`, `organizationId`, `ownerUid`, or `branchIds`.
3. Joining an existing organization as staff (`branch_manager`, `cashier`, `warehouse_staff`, `purchasing_staff`, `accountant`) requires an existing `pending` invitation matching `request.auth.token.email` and exact matching of `organizationId`, `role`, `branchIds`, and `ownerUid`.
4. All `list` queries are strictly bound to `resource.data` ownership/assignment checks with zero `get()`/`exists()` inside `allow list`.
5. `auditLogs` are strictly append-only (`update` and `delete` permanently denied).
6. Every document ID and string field enforces strict regex/length boundaries and server timestamp checks (`request.time`).

## 2. The "Dirty Dozen" Attack Payloads (Must Return PERMISSION_DENIED)
1. **Unverified Email Spoof:** Authenticated user with `email: "alaysisomboun@gmail.com"` and `email_verified: false` attempting `get` on `/organizations/org_1`.
2. **Self-Assigned Role Escalation (Create):** New user creating `/users/{uid}` with `role: "super_admin"` inside someone else's `organizationId`.
3. **Self-Assigned Role Escalation (Update):** Cashier updating `/users/{ownUid}` adding `role: "owner"` in `affectedKeys()`.
4. **Ghost Field Injection (Shadow Update):** Owner updating `/branches/{branchId}` with extra unexpected key `isVerified: true`.
5. **Cross-Organization Read/Scraping:** Authenticated user from `org_A` attempting `list` on `/branches` or `/auditLogs` belonging to `org_B`.
6. **ID Poisoning:** Creating `/branches/{1500_char_string}` exceeding 128-char `isValidId` bound.
7. **Timestamp Forgery:** Creating `/organizations/{orgId}` with client-side backdated `createdAt` instead of `request.time`.
8. **Audit Log Tampering:** Owner or Super Admin attempting `update` or `delete` on `/auditLogs/{auditId}`.
9. **Invitation Hijacking:** Attacker claiming `/invitations/{invId}` where `existing().email != request.auth.token.email`.
10. **PII Cross-User Read:** Cashier A attempting `get` on `/users/{cashierB_uid}`.
11. **Orphan Branch Creation:** Creating `/branches/{branchId}` pointing to a non-existent `organizationId`.
12. **Unbounded Array Exhaustion:** Updating `/branches/{branchId}` with `assignedUids` exceeding 50 items.
