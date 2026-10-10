"""Persistence models. Monetary values are integer CNY cents."""
from uuid import uuid4
from sqlalchemy import Boolean, CheckConstraint, Integer, JSON, String, Text, UniqueConstraint, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def uid():
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Product(Base):
    __tablename__ = "products"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    sku: Mapped[str] = mapped_column(String(100), unique=True)
    category: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30))
    owner: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (UniqueConstraint("product_id", "month", "channel"), CheckConstraint("revenue_cents >= 0"), CheckConstraint("units >= 0"))
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    month: Mapped[str] = mapped_column(String(7), index=True)
    revenue_cents: Mapped[int] = mapped_column(Integer)
    units: Mapped[int] = mapped_column(Integer)
    channel: Mapped[str] = mapped_column(String(100))
    note: Mapped[str] = mapped_column(Text, default="")


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (CheckConstraint("progress >= 0 AND progress <= 100"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    # Empty string represents an independent project in the public contract.
    # API validation provides the optional relationship constraint.
    product_id: Mapped[str] = mapped_column(String(64), default="")
    stage: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30))
    owner: Mapped[str] = mapped_column(String(100))
    due_date: Mapped[str] = mapped_column(String(10))
    progress: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text, default="")


class ProjectSchedule(Base):
    __tablename__ = 'project_schedules'
    project_id: Mapped[str] = mapped_column(ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True)
    start_date: Mapped[str] = mapped_column(String(10), default='')


class ProjectSource(Base):
    __tablename__ = "project_sources"
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    file_sha256: Mapped[str] = mapped_column(String(64), index=True)
    progress_known: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[dict] = mapped_column(JSON)


class ProjectProfile(Base):
    __tablename__ = "project_profiles"
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    priority: Mapped[str] = mapped_column(String(100), default="")
    phase: Mapped[str] = mapped_column(String(100), default="")
    structural_owner: Mapped[str] = mapped_column(String(100), default="")
    target: Mapped[str] = mapped_column(Text, default="")
    key_plan: Mapped[str] = mapped_column(Text, default="")
    risk_note: Mapped[str] = mapped_column(Text, default="")
    actual_completed_on: Mapped[str] = mapped_column(String(10), default="")
    progress_known: Mapped[bool] = mapped_column(Boolean, default=False)


class ProjectMilestone(Base):
    __tablename__ = "project_milestones"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    owner: Mapped[str] = mapped_column(String(100), default="")
    planned_start: Mapped[str] = mapped_column(String(10), default="")
    planned_end: Mapped[str] = mapped_column(String(10), default="")
    actual_start: Mapped[str] = mapped_column(String(10), default="")
    actual_end: Mapped[str] = mapped_column(String(10), default="")
    status: Mapped[str] = mapped_column(String(30), default="待开始")
    recorded_text: Mapped[str] = mapped_column(Text, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ProjectUpdate(Base):
    __tablename__ = "project_updates"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    content: Mapped[str] = mapped_column(Text)
    occurred_on: Mapped[str] = mapped_column(String(10), default="")
    author: Mapped[str] = mapped_column(String(100), default="")
    kind: Mapped[str] = mapped_column(String(30), default="进度记录")
    created_at: Mapped[str] = mapped_column(String(40))


class ProjectMilestoneFields(Base):
    __tablename__ = 'project_milestone_fields'
    milestone_id: Mapped[str] = mapped_column(ForeignKey('project_milestones.id', ondelete='CASCADE'), primary_key=True)
    deliverable: Mapped[str] = mapped_column(String(200), default='')
    priority: Mapped[str] = mapped_column(String(100), default='')
    document_ids: Mapped[list] = mapped_column(JSON, default=list)


class ProjectImage(Base):
    __tablename__ = "project_images"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    filename: Mapped[str] = mapped_column(String(100))
    caption: Mapped[str] = mapped_column(String(200), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ProjectFile(Base):
    __tablename__='project_files'
    id: Mapped[str]=mapped_column(String(64),primary_key=True,default=uid)
    project_id: Mapped[str]=mapped_column(ForeignKey('projects.id',ondelete='CASCADE'),index=True)
    milestone_id: Mapped[str]=mapped_column(ForeignKey('project_milestones.id',ondelete='CASCADE'),index=True)
    name: Mapped[str]=mapped_column(String(200))
    content_type: Mapped[str]=mapped_column(String(100),default='application/octet-stream')
    size: Mapped[int]=mapped_column(Integer)
    sha256: Mapped[str]=mapped_column(String(64))
    created_at: Mapped[str]=mapped_column(String(40))


class TaskContent(Base):
    __tablename__ = "task_content"
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), primary_key=True)
    description: Mapped[str] = mapped_column(Text, default="")


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    title: Mapped[str] = mapped_column(String(200))
    owner: Mapped[str] = mapped_column(String(100))
    due_date: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(30))


class Signal(Base):
    __tablename__ = "signals"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    kind: Mapped[str] = mapped_column(String(30))
    brand: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    sentiment: Mapped[str] = mapped_column(String(30))
    source_url: Mapped[str] = mapped_column(Text, default="")
    occurred_on: Mapped[str] = mapped_column(String(10), index=True)


class MarketSource(Base):
    __tablename__ = 'market_sources'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    collection_url: Mapped[str] = mapped_column(Text, unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    interval_hours: Mapped[int] = mapped_column(Integer, default=24)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    next_run_at: Mapped[str] = mapped_column(String(40), default='')
    last_run_at: Mapped[str] = mapped_column(String(40), default='')
    last_status: Mapped[str] = mapped_column(String(40), default='pending')
    message: Mapped[str] = mapped_column(Text, default='')


class MarketReview(Base):
    __tablename__ = 'market_reviews'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey('market_sources.id'), index=True)
    payload: Mapped[dict] = mapped_column(JSON)


class MarketRun(Base):
    __tablename__ = 'market_runs'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey('market_sources.id'), index=True)
    started_at: Mapped[str] = mapped_column(String(40), index=True)
    payload: Mapped[dict] = mapped_column(JSON)


class MarketProduct(Base):
    __tablename__ = 'market_products'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey('market_sources.id'), index=True)
    payload: Mapped[dict] = mapped_column(JSON)


class Seat(Base):
    __tablename__ = "seats"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(30))
    provider: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30))
    note: Mapped[str] = mapped_column(Text, default="")


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    frequency: Mapped[str] = mapped_column(String(20))
    enabled: Mapped[bool] = mapped_column(Boolean)
    next_run_at: Mapped[str] = mapped_column(String(40), index=True)
    last_run_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class SalesReferencePrice(Base):
    __tablename__ = "sales_reference_prices"
    product_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    currency: Mapped[str] = mapped_column(String(3))
    amount_cents: Mapped[int] = mapped_column(Integer)


class SalesDataState(Base):
    __tablename__ = "sales_data_state"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    version: Mapped[str] = mapped_column(String(64))
    patches: Mapped[list] = mapped_column(JSON, default=list)


class ProductTaxonomyState(Base):
    __tablename__ = "product_taxonomy_state"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    version: Mapped[str] = mapped_column(String(64))
    config: Mapped[dict] = mapped_column(JSON)
    previous: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class ProjectTableState(Base):
    __tablename__ = "project_table_state"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    version: Mapped[str] = mapped_column(String(64))
    data: Mapped[dict] = mapped_column(JSON)
    previous: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class ProjectTableFile(Base):
    __tablename__ = "project_table_files"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    project_id: Mapped[str] = mapped_column(String(80), index=True)
    milestone_id: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[str] = mapped_column(String(40))


class SalesDataChange(Base):
    __tablename__ = "sales_data_changes"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    label: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[str] = mapped_column(String(40))
    count: Mapped[int] = mapped_column(Integer)
    before_patches: Mapped[list] = mapped_column(JSON)
    undone: Mapped[bool] = mapped_column(Boolean, default=False)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    title: Mapped[str] = mapped_column(String(200))
    month: Mapped[str] = mapped_column(String(7))
    content: Mapped[str] = mapped_column(Text)
    generated_at: Mapped[str] = mapped_column(String(40))
    job_id: Mapped[str | None] = mapped_column(ForeignKey("jobs.id"), nullable=True)
    source: Mapped[str] = mapped_column(String(30), default="规则汇总")


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"
    __table_args__ = (UniqueConstraint("project_id", "template_id"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    project_id: Mapped[str] = mapped_column(String(64), default="")
    template_id: Mapped[str] = mapped_column(String(100))
    stage: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(200))
    owner: Mapped[str] = mapped_column(String(100), default="")
    status: Mapped[str] = mapped_column(String(30), default="草稿")
    content: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[str] = mapped_column(String(40))


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("scope", "name"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    scope: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(100))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class CustomField(Base):
    __tablename__ = "custom_fields"
    __table_args__ = (UniqueConstraint("scope", "key"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    scope: Mapped[str] = mapped_column(String(20), index=True)
    key: Mapped[str] = mapped_column(String(64))
    label: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(20))
    options: Mapped[list] = mapped_column(JSON, default=list)
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class EntityMeta(Base):
    __tablename__ = "entity_meta"
    scope: Mapped[str] = mapped_column(String(20), primary_key=True)
    entity_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    category_id: Mapped[str] = mapped_column(String(64), default="")
    values: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[str] = mapped_column(String(40))


class Activity(Base):
    __tablename__ = "activity"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    action: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(String(40))


class SessionToken(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[str] = mapped_column(String(40))


class JobRun(Base):
    __tablename__ = "job_runs"
    __table_args__ = (UniqueConstraint("job_id", "scheduled_for"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"))
    scheduled_for: Mapped[str] = mapped_column(String(80))
    started_at: Mapped[str] = mapped_column(String(40))
    finished_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20))
    error: Mapped[str] = mapped_column(Text, default="")
    report_id: Mapped[str | None] = mapped_column(ForeignKey("reports.id"), nullable=True)


ENTITIES = {"products": Product, "sales": Sale, "projects": Project, "tasks": Task,
            "signals": Signal, "seats": Seat, "jobs": Job, "knowledge_documents": KnowledgeDocument}


def serialize(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}
