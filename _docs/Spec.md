# Evenly — Product Specification

**Version:** MVP v1.0  
**Status:** Product scope defined  
**Primary currency:** Nigerian Naira (₦)

## 1. Product Overview

Evenly is a general-purpose expense splitting tool for friends, couples, families, roommates, coworkers, trips, events, and other groups.

Its core purpose is to make shared expenses easy to record, calculate, understand, and track without requiring users to make payments through the app.

Evenly supports:
- One-off **Quick Splits**
- Persistent **Saved Groups**
- Equal, custom-amount, percentage, and weighted-share splits
- Multiple payers per expense
- Individual debt tracking without automatic debt simplification
- Optional user accounts
- In-app notifications
- Receipt/photo attachments
- Activity history

## 2. Product Principles

1. **Fast:** A user should be able to calculate a simple split in seconds.
2. **Transparent:** Every member can see the full group balance and debt breakdown.
3. **Flexible:** Expenses can be split in multiple ways.
4. **Low friction:** Quick Split does not require an account.
5. **Accurate:** Totals, balances, and split allocations must always reconcile.
6. **No payment processing in MVP:** Evenly tells users who owes whom; payment happens outside the app.

## 3. Users and Accounts

### Guest users
Users can:
- Use Quick Split
- Add people by name
- Create and calculate expenses
- View the resulting balances

Quick Split data is local/session-based unless the user chooses to create an account and save it.

### Registered users
Accounts are optional.

Registered users can:
- Create and manage saved groups
- Sync their groups and expenses
- Receive in-app notifications
- Join groups through invitation links
- Access their groups across supported devices

Recommended MVP authentication:
- Email/password
- Optional social authentication can be added later

## 4. Core Features

### 4.1 Quick Split

Quick Split is the fastest workflow.

User flow:
1. Enter people by name.
2. Add an expense.
3. Enter amount.
4. Select payer(s).
5. Select participants.
6. Choose split method.
7. Review individual balances/debts.

Quick Split supports:
- Equal split
- Custom amounts
- Percentages
- Weighted shares
- Multiple payers

Quick Split does not require accounts.

### 4.2 Saved Groups

A user can create a persistent group such as:
- Lagos Trip
- Apartment Expenses
- Dinner Group
- Wedding Planning
- Project Team

A group contains:
- Group name
- Optional description
- Group creator/admin
- Members
- Expenses
- Balances
- Activity history
- Notifications

### 4.3 Group Membership

Members can be added through:
- Invite link
- Manual addition

Manual addition should allow the admin to add a person by name.

Invite links should allow a user to join the relevant group.

Recommended MVP rule:
- The creator is the group admin.
- Admin powers are intentionally limited.
- Admin can edit group details, manage membership, generate/revoke invite links, and remove members where appropriate.
- Admin cannot arbitrarily modify another member's expense.

### 4.4 Expenses

Each expense contains:

Required:
- Description
- Total amount
- Date
- One or more payers
- One or more participants
- Split method

Optional:
- Receipt/photo

Examples:
- Dinner — ₦45,000
- Uber — ₦8,500
- Electricity — ₦30,000

### 4.5 Multiple Payers

An expense can have multiple payers.

Example:

Total: ₦30,000

- A paid ₦20,000
- B paid ₦10,000

The payer contributions must equal the expense total.

### 4.6 Split Methods

#### Equal
The expense is divided equally among participants.

#### Custom Amount
The user assigns an exact amount to each participant.

The participant amounts must equal the expense total.

#### Percentage
The user assigns percentages to participants.

Percentages must total 100%.

#### Weighted Shares
The user assigns shares.

Example:
- A = 2 shares
- B = 1 share
- C = 1 share

The expense is distributed proportionally.

## 5. Balance and Debt Calculation

Evenly calculates each person's net position from:
- What they paid
- What they were responsible for

Conceptually:

`Net Balance = Total Paid - Total Share Owed`

Positive balance:
- Person is owed money.

Negative balance:
- Person owes money.

Zero:
- Person is settled.

### Important MVP rule

Evenly must **not simplify debts automatically**.

If the underlying transactions produce:
- A owes B ₦10,000
- B owes C ₦10,000

Evenly should retain and display those individual obligations rather than replacing them with:
- A owes C ₦10,000

The transaction-level debt relationships remain visible.

## 6. Group Balance View

All group members can see the complete group balance/debt breakdown.

The balance screen should show:
- Person
- Amount owed/owed to
- Relevant counterparties
- Current status

Example:

**Kunmi owes Ada ₦10,000**

**Ada owes Tobi ₦5,000**

No overall ranking or simplified settlement recommendation is required.

## 7. Expense Editing and Deletion

Only the user who created an expense can:
- Edit it
- Delete it

Changes must update balances immediately.

### Activity History

Evenly keeps an activity history for important actions, including:
- Expense created
- Expense edited
- Expense deleted
- Member joined
- Member added/removed
- Group details changed
- Debt marked as paid

Activity history should record:
- Actor
- Action
- Date/time
- Relevant object

Deleted expenses should remain represented in the activity history rather than silently disappearing from the audit trail.

## 8. Marking Debts as Paid

MVP does not process payments.

A user can optionally mark an individual debt as paid to keep the group state up to date.

Recommended behavior:
- Payment status is tracked separately from the original expense.
- The original expense remains unchanged.
- Members can see that the debt has been marked paid.
- A payment action creates an activity-history entry.
- Other members receive an in-app notification.

## 9. Notifications

MVP uses **in-app notifications only**.

Notifications cover:

### New expense
When an expense is added to a group.

### Expense changed
When an expense is edited.

### Expense deleted
When an expense is deleted.

### Debt marked paid
When a member marks a debt as paid.

### Group invitation
When someone invites a user to join a group.

Users should be able to:
- View notifications
- Mark notifications as read
- See unread count

Recommended later feature:
- Notification preferences

## 10. Dashboard

The main dashboard combines:

### Quick Split
A prominent action for starting a one-off split.

### My Groups
List of saved groups.

### Balances
A concise summary of what the user currently owes or is owed.

### Recent Activity
Recent expenses and relevant activity.

The dashboard should prioritize the two primary actions:
- **Start Quick Split**
- **Open a Group**

## 11. Group Screen

A saved group should contain:

### Header
- Group name
- Member count
- Admin controls

### Main sections
- Overview
- Expenses
- Balances
- Activity
- Members

### Primary actions
- Add expense
- Invite member

## 12. Expense Creation Flow

Recommended flow:

1. Description
2. Amount
3. Date
4. Payer(s)
5. Participants
6. Split method
7. Split allocation
8. Optional receipt
9. Review
10. Save

Validation:
- Amount must be greater than zero.
- At least one payer is required.
- At least one participant is required.
- Multiple payer contributions must equal the total.
- Custom allocations must equal the total.
- Percentage allocations must equal 100%.
- Weighted shares must be positive.

## 13. Receipt Attachments

Users can optionally attach a photo/receipt to an expense.

MVP:
- One receipt/photo per expense
- Image preview
- Replace/remove attachment
- Store securely
- Only group members can access the receipt

Future:
- Multiple receipts
- OCR
- Automatic merchant/amount extraction

## 14. Currency

MVP supports **Nigerian Naira (₦) only**.

Currency should nevertheless be modeled as an explicit property of the group/expense so additional currencies can be introduced later without redesigning the data model.

Future possibilities:
- USD
- GBP
- EUR
- Multi-currency groups
- Currency conversion

These are outside MVP.

## 15. Recommended Data Model

### User
- id
- name
- email
- password/auth provider
- created_at
- updated_at

### Group
- id
- name
- description
- owner_id
- currency
- created_at
- updated_at

### GroupMember
- id
- group_id
- user_id (nullable for invited/non-account members if supported)
- display_name
- role
- joined_at

### Expense
- id
- group_id / quick_split_id
- created_by
- description
- total_amount
- currency
- expense_date
- created_at
- updated_at
- deleted_at

### ExpensePayer
- id
- expense_id
- member_id
- amount

### ExpenseParticipant
- id
- expense_id
- member_id
- split_method
- allocation_value
- calculated_amount

### Receipt
- id
- expense_id
- file_url
- created_at

### Debt/Settlement
- id
- group_id
- from_member_id
- to_member_id
- amount
- status
- paid_at
- marked_paid_by
- created_at

### Activity
- id
- group_id
- actor_id
- action_type
- entity_type
- entity_id
- metadata
- created_at

### Notification
- id
- user_id
- group_id
- type
- title
- message
- read_at
- created_at

## 16. Permissions

| Action | Member | Admin | Expense Creator |
|---|---:|---:|---:|
| View group | Yes | Yes | Yes |
| View all balances | Yes | Yes | Yes |
| Add expense | Yes | Yes | Yes |
| Edit own expense | Yes | Yes | Yes |
| Delete own expense | Yes | Yes | Yes |
| Edit another member's expense | No | No | No |
| Delete another member's expense | No | No | No |
| Edit group details | No | Yes | No |
| Manage membership | No | Yes | No |
| Manage invite link | No | Yes | No |
| Mark relevant debt paid | Yes | Yes | Yes |

Admin permissions should remain minimal and should not override expense ownership.

## 17. MVP Navigation

Recommended navigation:

**Dashboard**
- Quick Split
- My Groups
- Balance summary
- Recent activity

**Groups**
- Group list
- Create group

**Notifications**
- Notification inbox

**Profile/Settings**
- Account
- Preferences
- Sign out

For guests, keep navigation minimal and avoid requiring account creation for Quick Split.

## 18. MVP Out of Scope

Do not build these initially:

- Payment processing
- Bank integrations
- Automatic debt simplification
- Multi-currency support
- Currency conversion
- Email/SMS/WhatsApp notifications
- Receipt OCR
- AI expense categorization
- Recurring expenses
- Advanced analytics
- Budgeting
- Subscription billing
- Public groups
- Complex admin roles
- Expense approval workflows

## 19. Future Roadmap

Potential post-MVP features:

### Phase 2
- Multiple currencies
- Recurring expenses
- Multiple receipt attachments
- Expense categories
- Search/filtering
- Export CSV/PDF
- Email notifications
- Better settlement tracking

### Phase 3
- Receipt OCR
- AI categorization
- Payment integrations
- Currency conversion
- Advanced analytics
- Shared budgets
- Smart settlement suggestions

## 20. Core MVP Acceptance Criteria

Evenly's MVP is complete when a user can:

1. Start a Quick Split without signing up.
2. Add people by name.
3. Add an expense.
4. Use any supported split method.
5. Use multiple payers.
6. See exactly who owes whom.
7. Create a saved group.
8. Add group members manually.
9. Invite members using a link.
10. Allow all members to add expenses.
11. Edit/delete their own expenses.
12. View the complete group balance.
13. Attach a receipt.
14. Mark a debt as paid.
15. See relevant activity history.
16. Receive in-app notifications.
17. Register for an account to save/sync groups.
18. Use Nigerian Naira throughout the MVP.

## 21. Product Positioning

**Evenly makes shared expenses easy to split and easy to understand.**

The MVP should prioritize:
- Fast expense entry
- Clear calculations
- Transparent debts
- Minimal permissions complexity
- No forced account creation
- No payment-processing complexity

The product should feel useful before asking the user to sign up.
