"""add calendar_id and read_only to calendar_events_cache

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-07-08 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "calendar_events_cache",
        sa.Column("calendar_id", sa.String(length=255), nullable=False, server_default="primary"),
    )
    op.add_column(
        "calendar_events_cache",
        sa.Column("read_only", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("calendar_events_cache", "read_only")
    op.drop_column("calendar_events_cache", "calendar_id")
