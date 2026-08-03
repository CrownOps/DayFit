"""add calendar_event_id to tasks

Revision ID: a1b2c3d4e5f6
Revises: a6b7c8d9e0f1
Create Date: 2026-07-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "a6b7c8d9e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("calendar_event_id", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_tasks_calendar_event_id"), "tasks", ["calendar_event_id"], unique=False
    )
    op.create_foreign_key(
        "fk_tasks_calendar_event_id_calendar_events_cache",
        "tasks",
        "calendar_events_cache",
        ["calendar_event_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_tasks_calendar_event_id_calendar_events_cache", "tasks", type_="foreignkey"
    )
    op.drop_index(op.f("ix_tasks_calendar_event_id"), table_name="tasks")
    op.drop_column("tasks", "calendar_event_id")
