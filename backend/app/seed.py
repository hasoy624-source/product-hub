"""Fictional demo data only. Never called in production."""
from datetime import timedelta, datetime, timezone
from sqlalchemy import select
from .models import Product, Sale, Project, Task, Signal, Seat, Job
from .services import local_today, shift_month, stamp, log, generate_report


def seed(session):
    if session.scalar(select(Product.id).limit(1)):
        return
    today = local_today()
    month = today.strftime("%Y-%m")
    products = [
        ("demo-p1", "智能舒眠颈枕", "REST-01", "智能健康", "在售", "林悦", "演示虚构产品 · 温感支撑与旅途舒眠"),
        ("demo-p2", "便携筋膜按摩仪", "MOVE-02", "运动恢复", "在售", "陈知远", "演示虚构产品 · 轻量化便携设计"),
        ("demo-p3", "桌面空气净化器", "AIR-03", "智能家居", "在售", "周可", "演示虚构产品 · 桌面清新空气"),
        ("demo-p4", "睡眠监测眼罩", "SLEEP-04", "智能健康", "研发中", "林悦", "演示虚构产品 · 正在进行工程验证"),
        ("demo-p5", "便携冷热杯", "CUP-05", "生活方式", "研发中", "苏禾", "演示虚构产品 · 概念验证阶段"),
    ]
    for values in products:
        session.add(Product(**dict(zip(("id", "name", "sku", "category", "status", "owner", "description"), values))))
    session.flush()
    for offset in range(-5, 1):
        current = shift_month(month, offset)
        amounts = [18_960_000 + (offset + 5) * 1_360_000, 6_820_000 + (offset + 5) * 310_000, 2_260_000 + (offset + 5) * 190_000]
        for index, amount in enumerate(amounts, 1):
            session.add(Sale(id=f"demo-sale-{offset+5}-{index}", product_id=f"demo-p{index}", month=current,
                             revenue_cents=amount, units=amount // (29900 if index == 1 else 39900), channel="独立站", note="演示虚构数据，不代表实际营收"))
    stages = ["EVT", "设计与开发", "概念与启动", "DVT", "MP"]
    names = ["睡眠眼罩 · 工程验证", "颈枕 2.0 · 结构升级", "冷热杯 · 需求探索", "净化器 · 可靠性验证", "按摩仪 · 量产准备"]
    for index, stage in enumerate(stages, 1):
        session.add(Project(id=f"demo-project-{index}", name=names[index-1], product_id=["demo-p4", "demo-p1", "demo-p5", "demo-p3", "demo-p2"][index-1], stage=stage,
                            status="风险" if index == 1 else "正常", owner=["林悦", "陈知远", "苏禾", "周可", "陈知远"][index-1],
                            due_date=(today + timedelta(days=index*7)).isoformat(), progress=[54, 32, 15, 76, 92][index-1], description="演示研发项目；阶段推进由负责人确认"))
    session.flush()
    for index, title in enumerate(["完成传感器稳定性测试", "确认结构设计评审意见", "整理首轮用户访谈", "完成跌落与寿命测试", "确认小批量试产清单"], 1):
        session.add(Task(id=f"demo-task-{index}", project_id=f"demo-project-{index}", title=title, owner=["林悦", "陈知远", "苏禾", "周可", "陈知远"][index-1],
                         due_date=(today + timedelta(days=index-3)).isoformat(), status="进行中" if index <= 2 else "待办"))
    records = [
        ("竞品动态", "NorthRest（虚构）", "新款旅行颈枕发布", "演示动态：增加可拆洗面料，主打轻量化旅行场景。", "中性", -1),
        ("竞品动态", "CalmLoop（虚构）", "启动秋季组合促销", "演示动态：以眼罩与颈枕组合销售；实际价格与活动均待人工核实。", "中性", -4),
        ("市场反馈", "用户访谈（虚构）", "用户期待更轻的机身", "演示访谈：通勤人群认为设备体积仍有优化空间。", "负向", -2),
        ("独立站评价", "演示顾客 A", "颈部支撑感提升", "演示评价：长途出行使用更舒适，收纳也很方便。", "正向", -3),
        ("独立站评价", "演示顾客 B", "说明书需要更清晰", "演示评价：首次配对步骤略复杂，建议增加图示。", "负向", -1),
    ]
    for index, (kind, brand, title, content, sentiment, offset) in enumerate(records, 1):
        session.add(Signal(id=f"demo-signal-{index}", kind=kind, brand=brand, title=title, content=content, sentiment=sentiment, source_url="", occurred_on=max(today.replace(day=1), today+timedelta(days=offset)).isoformat()))
    for index, (name, kind, provider) in enumerate([("AI 洞察席位", "AI 总结", "待选择模型供应商"), ("独立站销售席位", "销售数据", "待配置电商平台"), ("独立站评价席位", "评价采集", "待配置评价来源")], 1):
        session.add(Seat(id=f"demo-seat-{index}", name=name, kind=kind, provider=provider, status="待接入", note="配置占位，当前未发起任何外部请求"))
    next_month = shift_month(month, 1)
    session.add(Job(id="demo-job-1", name="竞品与市场月报", frequency="monthly", enabled=True,
                    next_run_at=f"{next_month}-01T01:00:00+00:00", last_run_at=None))
    session.flush()
    generate_report(session, month)
    log(session, "初始化演示空间：全部产品、品牌、销售与评价均为虚构样例")
    session.commit()
