"""add teams and team_rules tables

Revision ID: f4d5e6f7a8b9
Revises: e3c4d5e6f7a8
Create Date: 2026-07-07 06:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f4d5e6f7a8b9"
down_revision: Union[str, None] = "e3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "teams",
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("vision", sa.Text(), nullable=False, server_default=""),
        sa.Column("mission", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("team_id"),
    )
    op.create_table(
        "team_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_team_rules_team_id"), "team_rules", ["team_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_team_rules_team_id"), table_name="team_rules")
    op.drop_table("team_rules")
    op.drop_table("teams")
