## 1. Product Overview

**Evenly** is a general-purpose expense-splitting tool that helps people record shared expenses and determine:

1. Each person's net balance.
2. The minimum set of payments needed to settle those balances.

Calculates financial obligations but does **not** process, record, or verify actual payments.

The MVP supports both:
- Saved groups for recurring or multi-expense scenarios.
- Quick Split for one-off calculations without creating a saved group.

---

## 2. MVP Goals

A user should be able to:

- Create a group.
- Add people to a group.
- Add multiple expenses.
- Choose how each expense is split.
- Edit or delete expenses.
- Calculate net balances.
- Generate simplified settlements.
- Perform a one-off split without creating a group.
- Persist all saved-group data in a database.

The application should be structured so that the **business logic is database-agnostic** and can be tested independently of the persistence implementation.

---

## 3. Core Concepts

### Group

A group represents a collection of people sharing expenses.

A group contains:

- `id`
- `name`
- `members`
- `expenses`


### Member

A member is identified by a name only.

There are **no user accounts or authentication** in the MVP.

A member contains:

- `id`
- `name`
- `group_id`

Member names must be unique within a group.

### Expense

An expense represents money paid by one member for themselves and/or other members.

An expense contains:

- `id`
- `group_id`
- `description`
- `amount`
- `payer`
- `split_type`
- `split_details`

---

## 4. Expense Splitting

The MVP supports four split types.

### 4.1 Equal Split

The expense is divided equally among selected participants.`

The application should handle fractional results correctly according to the chosen currency's smallest unit.

### 4.2 Exact Amounts

The user specifies the exact amount owed by each participant.

Validation:

```text
sum(participant amounts) == expense amount
```

### 4.3 Percentages

The user specifies what percentage of the expense each participant owes.

Validation:

```text
sum(percentages) == 100%
```

### 4.4 Shares

The user specifies relative shares.

Shares must be positive.

---

## 5. Expense Rules

Each expense must have:

- A positive amount.
- A description.
- Exactly one payer.
- At least one participant.
- A valid split configuration.
- Participants who belong to the relevant group.

The payer may or may not be a participant in the expense split.

This allows scenarios where someone pays for other people without sharing the expense themselves.

---

## 6. Group Management

Users can:

- Create a group.
- View a group.
- Rename a group.
- Delete a group.
- Add members.
- Remove members.
- Add expenses.
- View expenses.
- Edit expenses.
- Delete expenses.
- View balances.
- View settlements.

### Member deletion

A member who is referenced by an existing expense should **not** be silently removed.

The MVP should prevent deletion and return a clear validation error.

This protects historical expense data.

---

## 7. Balances

Evenly calculates each member's net balance from all expenses.

Conceptually:

```text
net balance = amount paid - amount owed
```

Interpretation:

```text
positive balance → member should receive money
negative balance → member owes money
zero balance     → member is settled
```

---

## 8. Settlement Simplification

Evenly converts net balances into simplified payment obligations.


The goal is to reduce the number of required transfers while preserving the correct net balances.

The settlement engine should operate on balances rather than individual expenses.

Actual payments are outside the scope of the MVP.

---

## 9. Quick Split

Quick Split provides the same expense calculation functionality without requiring a saved group.

A user can:

1. Enter people.
2. Add one or more expenses.
3. Choose split types.
4. Calculate balances.
5. View simplified settlements.

Quick Split data does not need to be persisted after the session.

The same core calculation logic used by groups should be reused for Quick Split.

---

## 10. Database & Architecture

The MVP **will use a database**.

However, the application must remain database-agnostic at the business-logic level.

Recommended architecture:

```text
API / Presentation Layer
          ↓
Application / Service Layer
          ↓
Domain / Business Logic
          ↓
Repository Interface
          ↓
Database Repository
          ↓
SQLAlchemy
          ↓
Database
```

The service and calculation layers should not directly depend on SQLAlchemy.

Repositories should provide the persistence boundary.

---

## 11. Suggested Data Model

### Group

```text
Group
- id
- name
- created_at
- updated_at
```

### Member

```text
Member
- id
- group_id
- name
- created_at
```

### Expense

```text
Expense
- id
- group_id
- description
- amount
- payer_id
- split_type
- created_at
- updated_at
```

### Expense Split

The participant-specific split data should be represented separately from the expense itself.

```text
ExpenseSplit
- id
- expense_id
- member_id
- amount_owed
- percentage (nullable)
- shares (nullable)
```

The exact persistence representation can be refined during implementation, but the domain model should support all four split types.

---

## 12. Currency

The MVP uses **one currency per group**.

Currency conversion is out of scope.

The initial implementation can default to **NGN (₦)**, while keeping currency representation configurable enough to support additional currencies later.

Do not implement exchange-rate conversion in the MVP.

---

## 13. API Scope

A REST API should expose the core functionality.

### Groups

```http
POST   /groups
GET    /groups
GET    /groups/{group_id}
PATCH  /groups/{group_id}
DELETE /groups/{group_id}
```

### Members

```http
POST   /groups/{group_id}/members
DELETE /groups/{group_id}/members/{member_id}
```

### Expenses

```http
POST   /groups/{group_id}/expenses
GET    /groups/{group_id}/expenses
PATCH  /groups/{group_id}/expenses/{expense_id}
DELETE /groups/{group_id}/expenses/{expense_id}
```

### Calculations

```http
GET /groups/{group_id}/balances
GET /groups/{group_id}/settlements
```

### Quick Split

```http
POST /split
```

The exact request/response schemas should be defined during implementation.

---

## 14. Validation & Error Handling

The API should reject invalid input with clear, structured errors.

Examples:

- Group name is empty.
- Duplicate member name within a group.
- Expense amount is zero or negative.
- Expense has no participants.
- Payer does not belong to the group.
- Participant does not belong to the group.
- Exact amounts do not equal the expense total.
- Percentages do not equal 100%.
- Shares are zero or negative.
- Group/member/expense ID does not exist.
- Attempt to delete a member referenced by an existing expense.

Errors should be descriptive enough for an API client to understand what needs to be corrected.

---

## 15. Out of Scope

The following are explicitly excluded from the MVP:

- User accounts.
- Authentication/authorization.
- Payment processing.
- Payment verification.
- Settlement/payment history.
- Notifications.
- Email or SMS.
- Receipt uploads.
- OCR.
- Currency conversion.
- Multiple currencies within a single group.
- Real-time collaboration.
- Mobile applications.
- Social features.
- AI features.

These can be considered future enhancements.

---

## 16. Suggested Technology Stack

### Backend

- Python
- FastAPI
- Pydantic
- SQLAlchemy
- PostgreSQL or SQLite
- Pytest

### API Documentation

Use FastAPI's generated OpenAPI/Swagger documentation during development.

### Frontend

A simple web frontend may be added if required by the homework.

The frontend should consume the API rather than containing the core expense calculation logic.

---

## 17. Testing Requirements

The calculation engine is a critical part of the application and should have strong automated test coverage.

Tests should cover at minimum:

### Equal split

- Two participants.
- Multiple participants.
- Uneven division/remainder handling.

### Exact split

- Valid totals.
- Totals that do not match.
- Zero/negative values.

### Percentage split

- Valid 100% total.
- Totals below 100%.
- Totals above 100%.

### Shares split

- Valid shares.
- Zero shares.
- Negative shares.

### Balances

- One expense.
- Multiple expenses.
- Multiple payers.
- People who owe and receive.
- Fully balanced group.

### Settlements

- One creditor/multiple debtors.
- Multiple creditors/debtors.
- Already-balanced groups.
- Settlement minimization.

### CRUD

- Create/read/update/delete groups.
- Add/remove members.
- Create/read/update/delete expenses.
- Invalid IDs.
- Protected member deletion.

---

## 18. Definition of Done

The MVP is complete when the following workflow works end-to-end:

```text
Create Group
     ↓
Add Members
     ↓
Add Expenses
     ↓
Choose Split Type
     ↓
Validate Expense
     ↓
Persist Expense
     ↓
Calculate Net Balances
     ↓
Generate Simplified Settlements
     ↓
Display Results
```

And independently:

```text
Quick Split
     ↓
Enter People
     ↓
Add Expenses
     ↓
Calculate
     ↓
Display Balances + Settlements
```

The application should use a real database for persisted group data while keeping the calculation/business logic independent of the database implementation.

---

## 19. Product Name

**Evenly**

Tagline/description:

> **Split expenses. See who owes whom.**
