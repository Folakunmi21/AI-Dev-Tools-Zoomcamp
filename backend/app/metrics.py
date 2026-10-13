"""Application metrics for the Evenly API."""

from opentelemetry import metrics


meter = metrics.get_meter("evenly-backend")

groups_created = meter.create_counter(
    "evenly.groups.created",
    unit="{group}",
    description="Number of groups successfully created.",
)
quick_split_operations = meter.create_counter(
    "evenly.quick_splits.operations",
    unit="{operation}",
    description="Quick split creation attempts by outcome.",
)
quick_splits_created = meter.create_counter(
    "evenly.quick_splits.created",
    unit="{quick_split}",
    description="Number of quick splits successfully created.",
)
expense_split_validations = meter.create_counter(
    "evenly.expense_splits.validations",
    unit="{validation}",
    description="Expense allocation validations by outcome.",
)
expense_split_difference = meter.create_histogram(
    "evenly.expense_splits.amount_difference",
    unit="1",
    description="Difference between an expense total and allocated shares.",
)
expense_payer_scenarios = meter.create_counter(
    "evenly.expenses.payer_scenarios",
    unit="{expense}",
    description="Successfully validated expenses by payer scenario.",
)
balance_reconciliations = meter.create_counter(
    "evenly.balances.reconciliations",
    unit="{reconciliation}",
    description="Balance calculation invariant checks by outcome.",
)
personal_budgets_created = meter.create_counter(
    "evenly.personal_budgets.created",
    unit="{budget}",
    description="Number of personal budgets successfully created.",
)


def record_group_created() -> None:
    groups_created.add(1)


def record_quick_split(outcome: str) -> None:
    quick_split_operations.add(1, {"outcome": outcome})
    if outcome == "success":
        quick_splits_created.add(1)


def record_expense_split(
    *, total: int, allocations: list[int], split_method: str, operation: str
) -> None:
    difference = total - sum(allocations)
    attributes = {"operation": operation, "split_method": split_method}
    expense_split_difference.record(difference, attributes)
    expense_split_validations.add(
        1, {**attributes, "outcome": "valid" if difference == 0 else "invalid"}
    )


def record_payer_scenario(payer_count: int) -> None:
    scenario = "single" if payer_count == 1 else "multiple"
    expense_payer_scenarios.add(1, {"payer_scenario": scenario})


def record_balance_reconciliation(
    *, valid: bool, has_settlements: bool, payer_scenario: str
) -> None:
    balance_reconciliations.add(
        1,
        {
            "outcome": "valid" if valid else "invalid",
            "has_settlements": str(has_settlements).lower(),
            "payer_scenario": payer_scenario,
        },
    )


def record_personal_budget_created() -> None:
    personal_budgets_created.add(1)
