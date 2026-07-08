"""add bottlenecks and bottleneck_actions tables

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-07-08 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bottlenecks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bottlenecks_team_id"), "bottlenecks", ["team_id"], unique=False)
    op.create_index(op.f("ix_bottlenecks_user_id"), "bottlenecks", ["user_id"], unique=False)
    op.create_index(op.f("ix_bottlenecks_priority"), "bottlenecks", ["priority"], unique=False)
    op.create_index(op.f("ix_bottlenecks_status"), "bottlenecks", ["status"], unique=False)

    op.create_table(
        "bottleneck_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bottleneck_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("effect", sa.Text(), nullable=False, server_default=""),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["bottleneck_id"], ["bottlenecks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_bottleneck_actions_bottleneck_id"), "bottleneck_actions", ["bottleneck_id"], unique=False
    )
    op.create_index(
        op.f("ix_bottleneck_actions_user_id"), "bottleneck_actions", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_bottleneck_actions_user_id"), table_name="bottleneck_actions")
    op.drop_index(op.f("ix_bottleneck_actions_bottleneck_id"), table_name="bottleneck_actions")
    op.drop_table("bottleneck_actions")
    op.drop_index(op.f("ix_bottlenecks_status"), table_name="bottlenecks")
    op.drop_index(op.f("ix_bottlenecks_priority"), table_name="bottlenecks")
    op.drop_index(op.f("ix_bottlenecks_user_id"), table_name="bottlenecks")
    op.drop_index(op.f("ix_bottlenecks_team_id"), table_name="bottlenecks")
    op.drop_table("bottlenecks")
