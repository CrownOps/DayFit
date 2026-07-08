"""add status column to tasks

Revision ID: c2d3e4f5a6b7
Revises: b8c9d0e1f2a3
Create Date: 2026-07-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("status", sa.String(length=16), nullable=False, server_default="todo"),
    )
    # Backfill: existing completed tasks map to "done".
    op.execute("UPDATE tasks SET status = 'done' WHERE completed")


def downgrade() -> None:
    op.drop_column("tasks", "status")
