"""add recurring room reservation tables

Revision ID: b1c2d3e4f5a6
Revises: a1b2c3d4e5f6
Create Date: 2026-07-31 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "recurring_room_reservations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("meeting_room_id", sa.Integer(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("purpose", sa.String(length=500), nullable=True),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_recurring_room_reservations_user_id"),
        "recurring_room_reservations",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "recurring_reservation_occurrences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.Column("occurrence_date", sa.Date(), nullable=False),
        sa.Column("gcs_reservation_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("detail", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["rule_id"], ["recurring_room_reservations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_recurring_reservation_occurrences_rule_id"),
        "recurring_reservation_occurrences",
        ["rule_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_recurring_reservation_occurrences_occurrence_date"),
        "recurring_reservation_occurrences",
        ["occurrence_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_recurring_reservation_occurrences_occurrence_date"),
        table_name="recurring_reservation_occurrences",
    )
    op.drop_index(
        op.f("ix_recurring_reservation_occurrences_rule_id"),
        table_name="recurring_reservation_occurrences",
    )
    op.drop_table("recurring_reservation_occurrences")
    op.drop_index(
        op.f("ix_recurring_room_reservations_user_id"), table_name="recurring_room_reservations"
    )
    op.drop_table("recurring_room_reservations")
