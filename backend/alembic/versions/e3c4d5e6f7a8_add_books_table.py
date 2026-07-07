"""add books table

Revision ID: e3c4d5e6f7a8
Revises: d2b3c4e5f6a7
Create Date: 2026-07-07 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e3c4d5e6f7a8"
down_revision: Union[str, None] = "d2b3c4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "books",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("author", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="want"),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("review", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_books_user_id"), "books", ["user_id"], unique=False)
    op.create_index(op.f("ix_books_status"), "books", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_books_status"), table_name="books")
    op.drop_index(op.f("ix_books_user_id"), table_name="books")
    op.drop_table("books")
