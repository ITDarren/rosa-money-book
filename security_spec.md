# Security Specification: 寶兒專屬記帳本 (Bao'er's Exclusive Accounting Book)

## 1. Data Invariants
- A user can only access their own data.
- Transactions must have a valid amount and timestamp.
- Custom categories must have a name, emoji, and type.
- Bank accounts must have a name, bankName, balance, color, and order.
- Document IDs must follow strict format rules.

## 2. The "Dirty Dozen" Payloads (Deny Tests)

1. **Identity Spoofing**: Attempt to create a transaction for another user.
   - Path: `/users/victim_uid/transactions/attack_id`
   - User: `attacker_uid`
   - Result: PERMISSION_DENIED

2. **Shadow Field Injection**: Attempt to create a transaction with an unauthorized field.
   - Payload: `{ amount: 100, type: 'expense', category: 'Food', timestamp: request.time, isVerified: true }`
   - Result: PERMISSION_DENIED (Strict key check)

3. **Value Poisoning (Type)**: Attempt to set amount to a string.
   - Payload: `{ amount: '100', type: 'expense', category: 'Food', timestamp: request.time }`
   - Result: PERMISSION_DENIED (Type safety check)

4. **Value Poisoning (Size)**: Attempt to inject a 1MB string into the note.
   - Payload: `{ amount: 100, note: LARGE_STRING, ... }`
   - Result: PERMISSION_DENIED (Size boundary check)

5. **Resource Exhaustion (ID)**: Attempt to create a document with a 2KB ID.
   - Path: `/users/uid/transactions/LONG_ID...`
   - Result: PERMISSION_DENIED (isValidId check)

6. **State Shortcutting**: Attempt to create an invalid transaction type.
   - Payload: `{ type: 'magic', ... }`
   - Result: PERMISSION_DENIED (Enum check)

7. **Date Spoofing**: Attempt to set a past/future date using client-side spoofing.
   - Rules enforce server timestamps for `createdAt` and `updatedAt` (if implemented). 
   - Note: The app currently uses `data.timestamp` which is required for accounting, but we validate it is a timestamp.

8. **Account Hijacking**: Attempt to update another user's balance.
   - Path: `/users/victim_uid`
   - Result: PERMISSION_DENIED

9. **Category Injection**: Attempt to create a category for another user.
   - Path: `/users/victim_uid/categories/cat_id`
   - Result: PERMISSION_DENIED

10. **Query Scraping**: Attempt to list all users.
    - Path: `/users`
    - Result: PERMISSION_DENIED (Global deny catch-all)

11. **PII Leakage**: Attempt to get another user's profile info.
    - Path: `/users/victim_uid`
    - Result: PERMISSION_DENIED (if not signed in or not owner, though 'get' is currently allowed if signed in).
    - *Audit Note*: The rules allow `get` if `isSignedIn()`. I should tighten this to `isOwner()`.

12. **Orphaned Write**: Attempt to create a transaction for a non-existent account. (Relational Sync)
    - Note: Rules currently don't check for account existence via `exists()` for every transaction create, as it would cost an extra read. However, we should ensure the userId matches.

## 3. Test Runner (Draft)
```typescript
// firestore.rules.test.ts (Requires @firebase/rules-unit-testing)
import { assertSucceeds, assertFails, initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";

// ... Test implementation for the Dirty Dozen ...
```
