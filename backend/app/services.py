import calendar
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from .models import Activity, Job, JobRun, Product, Project, Report, Sale, Signal, Task, uid


def utcnow():
    return datetime.now(timezone.utc)


def stamp(value=None):
    return (value or utcnow()).astimezone(timezone.utc).isoformat(timespec="seconds")


def local_today():
    return datetime.now(ZoneInfo("Asia/Shanghai")).date()


def shift_month(month, amount):
    year, number = map(int, month.split("-"))
    total = year * 12 + number - 1 + amount
    y, m = divmod(total, 12)
    return f"{y:04d}-{m+1:02d}"


def log(session, action):
    session.add(Activity(action=action, created_at=stamp()))


def dashboard(session, month, today=None):
    today = today or local_today()
    products = session.scalars(select(Product)).all()
    months = [shift_month(month, offset) for offset in range(-5, 1)]
    totals = defaultdict(int)
    per_product = defaultdict(int)
    for sale in session.scalars(select(Sale).where(Sale.month.in_(months))):
        totals[sale.month] += sale.revenue_cents
        if sale.month == month:
            per_product[sale.product_id] += sale.revenue_cents
    total = totals[month]
    previous = totals[shift_month(month, -1)]
    product_sales, categories = [], defaultdict(int)
    for product in products:
        amount = per_product[product.id]
        product_sales.append({"product_id": product.id, "name": product.name, "category": product.category,
                              "revenue_cents": amount, "share": round(amount / total * 100, 2) if total else 0})
        categories[product.category] += amount
    product_sales.sort(key=lambda item: (-item["revenue_cents"], item["name"]))
    projects = session.scalars(select(Project)).all()
    tasks = session.scalars(select(Task)).all()
    return {"month": month, "revenue_cents": total, "previous_revenue_cents": previous,
            "growth_pct": round((total - previous) / previous * 100, 2) if previous else None,
            "top_product_share": product_sales[0]["share"] if product_sales else 0, "risk_threshold": 60,
            "product_count": len(products),
            "active_projects": sum(p.status not in ("暂停", "已完成") for p in projects),
            "overdue_tasks": sum(t.status != "已完成" and t.due_date < today.isoformat() for t in tasks),
            "product_sales": product_sales,
            "trend": [{"month": m, "revenue_cents": totals[m]} for m in months],
            "category_sales": [{"category": key, "revenue_cents": amount, "share": round(amount / total * 100, 2) if total else 0}
                               for key, amount in sorted(categories.items(), key=lambda pair: (-pair[1], pair[0]))]}


def generate_report(session, month, job_id=None):
    if job_id and not session.get(Job, job_id):
        raise ValueError("报告关联的定时任务不存在")
    signals = session.scalars(select(Signal).where(Signal.occurred_on >= month + "-01", Signal.occurred_on < shift_month(month, 1) + "-01").order_by(Signal.occurred_on)).all()
    summary = dashboard(session, month)
    lines = [f"# {month} 竞品与市场月报", "", "> 生成方式：规则汇总。仅使用系统内人工录入的数据，未调用 AI 或外部采集服务；演示环境中的产品、品牌与数字均为虚构样例。", "",
             "## 数据概览", f"- 净销售额：¥{summary['revenue_cents'] / 100:,.2f}",
             f"- 第一产品销售占比：{summary['top_product_share']:.2f}%（预警阈值 60%）",
             f"- 月内信息记录：{len(signals)} 条", "",
             "## 集中度观察",
             "本月净销售额为 0，暂无足够销售数据判断集中风险。" if not summary["revenue_cents"] else ("单品占比达到或超过 60%，建议核查产品组合集中风险。" if summary["top_product_share"] >= 60 else "本月单品占比未达到 60% 阈值；这不等同于业务风险评估。"), ""]
    for kind in ("竞品动态", "市场反馈", "独立站评价"):
        items = [signal for signal in signals if signal.kind == kind]
        lines += [f"## {kind}（{len(items)} 条）"]
        if not items:
            lines += ["本月暂无已录入记录。"]
        for signal in items:
            lines += [f"### {signal.occurred_on} · {signal.brand} · {signal.title}",
                      f"情绪标签：{signal.sentiment}", "", signal.content,
                      f"来源：{signal.source_url or '人工录入，未提供来源链接'}", ""]
    lines += ["## 建议跟进", "- 核实负向反馈及其来源，并将需要落地的改进关联到研发任务。", "- 按月补充竞品信息；信息缺失不代表竞品没有变化。", "", "以上建议来自固定规则，未生成趋势预测或 AI 结论。"]
    report = Report(title=f"{month} 竞品与市场月报", month=month, content="\n".join(lines), generated_at=stamp(), job_id=job_id, source="规则汇总")
    session.add(report)
    session.flush()
    log(session, f"生成规则汇总月报：{month}")
    return report


def next_occurrence(frequency, anchor, now=None):
    current = datetime.fromisoformat(anchor).astimezone(ZoneInfo("Asia/Shanghai"))
    now = (now or utcnow()).astimezone(ZoneInfo("Asia/Shanghai"))
    while current <= now:
        if frequency == "daily":
            # Skip downtime efficiently, rather than generating a backlog.
            current += timedelta(days=max(1, (now - current).days))
        elif frequency == "weekly":
            current += timedelta(days=7 * max(1, (now - current).days // 7))
        else:
            month = shift_month(current.strftime("%Y-%m"), 1)
            year, number = map(int, month.split("-"))
            current = current.replace(year=year, month=number, day=min(current.day, calendar.monthrange(year, number)[1]))
    return stamp(current)


def claim_job(factory, job_id, now=None, manual=False):
    now = now or utcnow()
    with factory() as session:
        job = session.get(Job, job_id)
        if not job or (not manual and (not job.enabled or job.next_run_at > stamp(now))):
            return None
        scheduled = f"manual:{uid()}" if manual else job.next_run_at
        new_next = next_occurrence(job.frequency, job.next_run_at, now)
        statement = update(Job).where(Job.id == job.id, Job.next_run_at == job.next_run_at)
        if not manual:
            statement = statement.where(Job.enabled.is_(True))
        changed = session.execute(statement.values(next_run_at=new_next, last_run_at=stamp(now)))
        if changed.rowcount != 1:
            session.rollback()
            return None
        run = JobRun(job_id=job.id, scheduled_for=scheduled, started_at=stamp(now), status="running", error="")
        session.add(run)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            return None
        return run.id


def execute_run(factory, run_id, month=None):
    try:
        with factory() as session:
            run = session.get(JobRun, run_id)
            if run.status != "running":
                return session.get(Report, run.report_id) if run.report_id else None
            job = session.get(Job, run.job_id)
            report_month = month or shift_month(local_today().strftime("%Y-%m"), -1 if job.frequency == "monthly" else 0)
            report = generate_report(session, report_month, job.id)
            run.status, run.report_id, run.finished_at = "succeeded", report.id, stamp()
            job.last_run_at = stamp()
            session.commit()
            return report
    except Exception as error:
        with factory() as session:
            run = session.get(JobRun, run_id)
            run.status, run.error, run.finished_at = "failed", f"{type(error).__name__}: {str(error)[:1000]}", stamp()
            log(session, f"定时报告执行失败：{run.job_id}；详见作业执行记录")
            session.commit()
        raise


def tick(factory, now=None):
    now = now or utcnow()
    with factory() as session:
        # A crashed process cannot leave a run appearing active forever.
        stale = session.scalars(select(JobRun).where(JobRun.status == "running", JobRun.started_at < stamp(now - timedelta(minutes=15)))).all()
        for run in stale:
            run.status, run.finished_at, run.error = "failed", stamp(now), "执行超时或 worker 中断；可手动重跑"
        session.commit()
        ids = session.scalars(select(Job.id).where(Job.enabled.is_(True), Job.next_run_at <= stamp(now))).all()
    completed = []
    for job_id in ids:
        run_id = claim_job(factory, job_id, now)
        if run_id:
            try:
                execute_run(factory, run_id)
            except Exception:
                pass  # execute_run persists diagnostics; other jobs still run.
            completed.append(run_id)
    return completed
