"""add calendar_sync_state to avoid re-syncing Google on every request

`/api/calendar/events`는 요청마다 Google 전체 동기화를 돌렸다. 날짜를 넘기거나
월간/주간/일간을 바꿀 때마다 왕복이 다시 발생한다. 어떤 구간을 언제 당겨왔는지
기록해 두면, 최근에 동기화된 구간에 포함되는 요청은 캐시만으로 응답할 수 있다.

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-08-26 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "calendar_sync_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("range_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("range_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_calendar_sync_state_user_id"), "calendar_sync_state", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_calendar_sync_state_user_id"), table_name="calendar_sync_state")
    op.drop_table("calendar_sync_state")
