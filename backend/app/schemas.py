import re
from datetime import date, datetime, timezone
from typing import Annotated, Literal
from urllib.parse import urlparse
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, AfterValidator, model_validator


def month_value(value: str) -> str:
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value) or not 1900 <= int(value[:4]) <= 9998:
        raise ValueError("月份格式应为 YYYY-MM，年份范围 1900–9998")
    return value


def date_value(value: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("日期格式应为 YYYY-MM-DD")
    date.fromisoformat(value)
    return value


def timestamp_value(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("执行时间必须包含时区，例如 2026-10-01T09:00:00+08:00")
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")


def url_value(value: str) -> str:
    if value:
        parsed = urlparse(value)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError("来源地址应为不含凭据的 http/https URL")
    return value


NonEmpty = Annotated[str, Field(min_length=1, max_length=200)]
NonEmpty100 = Annotated[str, Field(min_length=1, max_length=100)]
Reference = Annotated[str, Field(min_length=1, max_length=64)]
OptionalReference = Annotated[str, Field(max_length=64)]
Short = Annotated[str, Field(max_length=100)]
Long = Annotated[str, Field(max_length=20000)]
Month = Annotated[str, AfterValidator(month_value)]
Date = Annotated[str, AfterValidator(date_value)]
OptionalDate = Annotated[str, AfterValidator(lambda value: date_value(value) if value else "")]
Timestamp = Annotated[str, AfterValidator(timestamp_value)]
NonNegative = Annotated[StrictInt, Field(ge=0, le=2_000_000_000)]


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ProductIn(Schema):
    name: NonEmpty
    sku: NonEmpty100
    category: NonEmpty100
    status: Literal["在售", "研发中", "已下架"] = "在售"
    owner: NonEmpty100
    description: Long = ""


class SaleIn(Schema):
    product_id: Reference
    month: Month
    revenue_cents: NonNegative
    units: NonNegative = 0
    channel: NonEmpty100 = "独立站"
    note: Long = ""


class ProjectProfileIn(Schema):
    priority: Short = ""
    phase: Short = ""
    structural_owner: Short = ""
    target: Long = ""
    key_plan: Long = ""
    risk_note: Long = ""
    actual_completed_on: OptionalDate = ""


class MilestoneIn(Schema):
    name: NonEmpty
    owner: Short = ""
    planned_start: OptionalDate = ""
    planned_end: OptionalDate = ""
    actual_start: OptionalDate = ""
    actual_end: OptionalDate = ""
    status: Literal["待开始", "进行中", "已完成", "暂停", "待确认"] = "待开始"
    recorded_text: Long = ""
    note: Long = ""
    sort_order: Annotated[StrictInt, Field(ge=0, le=10000)] = 0
    deliverable: Annotated[str, Field(max_length=200)] = ''
    priority: Short = ''
    document_ids: Annotated[list[Reference], Field(max_length=30)] = []

    @model_validator(mode="after")
    def ordered_dates(self):
        for prefix in ("planned", "actual"):
            start, end = getattr(self, prefix + "_start"), getattr(self, prefix + "_end")
            if start and end and start > end:
                raise ValueError("结束日期应不早于开始日期")
        return self


class ProjectUpdateIn(Schema):
    content: Annotated[str, Field(min_length=1, max_length=100000)]
    occurred_on: OptionalDate = ""
    author: Short = ""
    kind: Literal["进度记录", "历史进度", "关键节点", "历史问题", "风险记录", "待确认", "操作记录"] = "进度记录"


class ProjectIn(Schema):
    name: NonEmpty
    product_id: OptionalReference = ""
    stage: Literal["概念与启动", "设计与开发", "EVT", "DVT", "MP", "待确认"] = "概念与启动"
    status: Literal["正常", "风险", "暂停", "已完成", "待立项", "已终止", "待确认"] = "正常"
    owner: Short = ""
    start_date: OptionalDate = ""
    due_date: OptionalDate = ""
    progress: Annotated[StrictInt, Field(ge=0, le=100)] = 0
    description: Long = ""
    profile: ProjectProfileIn | None = None

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.start_date and self.due_date and self.start_date > self.due_date:
            raise ValueError("截止日期应不早于开始日期")
        return self


class TaskIn(Schema):
    project_id: Reference
    title: NonEmpty
    owner: Short = ""
    due_date: OptionalDate = ""
    status: Literal["待办", "进行中", "已完成"] = "待办"
    description: Annotated[str, Field(max_length=100000)] = ""


class SignalIn(Schema):
    kind: Literal["竞品动态", "市场反馈", "独立站评价"]
    brand: NonEmpty100
    title: NonEmpty
    content: Long
    sentiment: Literal["正向", "中性", "负向"] = "中性"
    source_url: Annotated[str, Field(max_length=2000), AfterValidator(url_value)] = ""
    occurred_on: Date


class SeatIn(Schema):
    name: NonEmpty
    kind: Literal["AI 总结", "销售数据", "评价采集"]
    provider: NonEmpty100
    status: Literal["待接入", "已停用"] = "待接入"
    note: Long = ""


class JobIn(Schema):
    name: NonEmpty
    frequency: Literal["daily", "weekly", "monthly"] = "monthly"
    enabled: StrictBool = True
    next_run_at: Timestamp


class ReportIn(Schema):
    month: Month
    job_id: Reference | None = None


class KnowledgeDocumentIn(Schema):
    project_id: OptionalReference = ""
    template_id: NonEmpty100
    stage: Literal["概念与启动", "设计与开发", "EVT", "DVT", "MP"]
    title: NonEmpty
    owner: Short = ""
    status: Literal["草稿", "待评审", "已归档"] = "草稿"
    content: Annotated[str, Field(max_length=100000)] = ""


class CategoryIn(Schema):
    scope: Literal["project", "report"]
    name: NonEmpty100
    active: StrictBool = True
    sort_order: Annotated[StrictInt, Field(ge=0, le=10000)] = 0


class CustomFieldIn(Schema):
    scope: Literal["project", "report"]
    key: Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")]
    label: NonEmpty100
    kind: Literal["text", "number", "date", "select"] = "text"
    options: Annotated[list[NonEmpty100], Field(max_length=30)] = Field(default_factory=list)
    required: StrictBool = False
    active: StrictBool = True
    sort_order: Annotated[StrictInt, Field(ge=0, le=10000)] = 0


class EntityMetaIn(Schema):
    category_id: OptionalReference = ""
    values: Annotated[dict[str, Annotated[str, Field(max_length=1000)]], Field(max_length=50)] = Field(default_factory=dict)


class LoginIn(Schema):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    username: Annotated[str, Field(min_length=1, max_length=200)]
    password: Annotated[str, Field(min_length=1, max_length=1024)]


SCHEMAS = {"products": ProductIn, "sales": SaleIn, "projects": ProjectIn,
           "tasks": TaskIn, "signals": SignalIn, "seats": SeatIn, "jobs": JobIn,
           "knowledge_documents": KnowledgeDocumentIn}
