"""Shared SQLAlchemy metadata used by the application and Alembic."""
from __future__ import annotations

from sqlalchemy import JSON, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class EntityRow(Base):
    __tablename__ = "evenly_entities"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
