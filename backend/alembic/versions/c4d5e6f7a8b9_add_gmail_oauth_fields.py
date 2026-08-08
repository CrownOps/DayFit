"""add separate gmail oauth fields to users

Gmail used to ride on the same OAuth connection as Google Calendar, forcing
both onto the same Google account. This adds its own token columns so a user
can connect a different Google account for email than for calendar.

Revision ID: c4d5e6f7a8b9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-08 00:05:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("gmail_oauth_token_encrypted", sa.String(), nullable=True))
    op.add_column("users", sa.Column("gmail_refresh_token_encrypted", sa.String(), nullable=True))
    op.add_column(
        "users",
        sa.Column("gmail_connected", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "gmail_connected")
    op.drop_column("users", "gmail_refresh_token_encrypted")
    op.drop_column("users", "gmail_oauth_token_encrypted")
