"""add per-team edit policies for rules and vision/mission

팀룰과 비전·미션의 수정 권한을 팀 단위로 설정할 수 있게 한다
("admin" = 관리자만, "member" = 팀원 전체). 기존 팀은 지금까지의 동작인
관리자 전용("admin")을 유지한다.

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-26 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "teams",
        sa.Column("rules_edit_policy", sa.String(length=16), nullable=False, server_default="admin"),
    )
    op.add_column(
        "teams",
        sa.Column("profile_edit_policy", sa.String(length=16), nullable=False, server_default="admin"),
    )


def downgrade() -> None:
    op.drop_column("teams", "profile_edit_policy")
    op.drop_column("teams", "rules_edit_policy")
