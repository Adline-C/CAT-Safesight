import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

class SeverityLevel(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class Machinery(Base):
    __tablename__ = "machinery"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    machine_name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    operator: Mapped[str] = mapped_column(String(255), nullable=False)

    near_miss_incidents: Mapped[list["NearMissIncident"]] = relationship(
        back_populates="machinery",
        cascade="all, delete-orphan",
    )

class NearMissIncident(Base):
    __tablename__ = "near_miss_incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    machine_id: Mapped[int] = mapped_column(
        ForeignKey("machinery.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    severity: Mapped[SeverityLevel] = mapped_column(
        Enum(SeverityLevel, name="severity_level"),
        nullable=False,
    )
    coordinates: Mapped[dict] = mapped_column(JSONB, nullable=False)

    machinery: Mapped["Machinery"] = relationship(back_populates="near_miss_incidents")