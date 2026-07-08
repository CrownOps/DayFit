from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Bottleneck(Base):
    """A team/project bottleneck, shared across everyone with the same ``team_id``.

    ``priority`` ("high"/"medium"/"low") drives the ordering and ``status``
    ("open"/"in_progress"/"resolved") tracks the resolution lifecycle. ``occurred_at``
    records when the bottleneck surfaced and ``deadline`` when it should be resolved by.
    Resolution work is captured as child :class:`BottleneckAction` rows.
    """

    __tablename__ = "bottlenecks"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)  # creator

    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text, default="")

    # "high" | "medium" | "low"
    priority: Mapped[str] = mapped_column(String(16), default="medium", index=True)
    # "open" | "in_progress" | "resolved"
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)

    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    actions: Mapped[list["BottleneckAction"]] = relationship(
        back_populates="bottleneck",
        cascade="all, delete-orphan",
        order_by="BottleneckAction.id",
    )


class BottleneckAction(Base):
    """A concrete action taken to resolve a bottleneck, plus its recorded effect.

    ``content`` is the planned/executed action; ``effect`` is filled in afterwards to
    capture the outcome; ``done`` marks whether the action has been carried out.
    """

    __tablename__ = "bottleneck_actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    bottleneck_id: Mapped[int] = mapped_column(
        ForeignKey("bottlenecks.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)  # creator

    content: Mapped[str] = mapped_column(Text)
    effect: Mapped[str] = mapped_column(Text, default="")
    done: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    bottleneck: Mapped["Bottleneck"] = relationship(back_populates="actions")
