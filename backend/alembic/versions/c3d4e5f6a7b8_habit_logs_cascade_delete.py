"""habit_logs.habit_id cascades on delete

Deleting a habit failed with a foreign key violation whenever it had any logs
(i.e. had ever been checked off) because habit_logs.habit_id referenced
habits.id with no ON DELETE behavior. Add ON DELETE CASCADE so removing a
habit removes its logs too.

Revision ID: c3d4e5f6a7b8
Revises: b1c2d3e4f5a6
Create Date: 2026-08-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("habit_logs_habit_id_fkey", "habit_logs", type_="foreignkey")
    op.create_foreign_key(
        "habit_logs_habit_id_fkey",
        "habit_logs",
        "habits",
        ["habit_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("habit_logs_habit_id_fkey", "habit_logs", type_="foreignkey")
    op.create_foreign_key(
        "habit_logs_habit_id_fkey",
        "habit_logs",
        "habits",
        ["habit_id"],
        ["id"],
    )
