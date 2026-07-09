"""add team task pool (nullable user_id + team_id on tasks)

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-07-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Unclaimed team-pool tasks have no owner, so user_id must be nullable.
    op.alter_column("tasks", "user_id", existing_type=sa.Integer(), nullable=True)
    op.add_column("tasks", sa.Column("team_id", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_tasks_team_id"), "tasks", ["team_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tasks_team_id"), table_name="tasks")
    op.drop_column("tasks", "team_id")
    # Reclaim orphaned pool tasks would be lost; assume none exist on downgrade.
    op.alter_column("tasks", "user_id", existing_type=sa.Integer(), nullable=False)
