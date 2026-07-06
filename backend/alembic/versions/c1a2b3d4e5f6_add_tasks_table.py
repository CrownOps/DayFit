"""add tasks table

Revision ID: c1a2b3d4e5f6
Revises: b68b1e7f7bab
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c1a2b3d4e5f6"
down_revision: Union[str, None] = "b68b1e7f7bab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("anchor_date", sa.Date(), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tasks_user_id"), "tasks", ["user_id"], unique=False)
    op.create_index(op.f("ix_tasks_anchor_date"), "tasks", ["anchor_date"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tasks_anchor_date"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_user_id"), table_name="tasks")
    op.drop_table("tasks")
