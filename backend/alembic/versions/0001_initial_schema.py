"""Create the initial Evenly persistence table.

Revision ID: 0001_initial_schema
Revises:
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001_initial_schema"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "evenly_entities",
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evenly_entities_kind", "evenly_entities", ["kind"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_evenly_entities_kind", table_name="evenly_entities")
    op.drop_table("evenly_entities")
