# Product Hub 接手指南（工作模式与部署路径）

> 本文件是仓库级交接入口。开始工作时，先运行 `git rev-parse --show-toplevel` 确认仓库根目录，再读本文件与当前源码；不要把本机绝对路径、演示数据或历史聊天当作部署配置。

## 1. 当前实际状态

- 代码仓库：<https://github.com/hasoy624-source/product-hub>，主分支 `main`。
- **已上线的是静态演示预览**：<https://hasoy624-source.github.io/product-hub/>。部署入口是 [`.github/workflows/deploy-preview.yml`](.github/workflows/deploy-preview.yml)，发布目标是 GitHub Pages。
- 预览构建设置 `VITE_PREVIEW_MODE=true`，`frontend/src/api.ts` 因而调用 `frontend/src/preview.ts`。数据是浏览器内的虚构样例与 `localStorage`，不同浏览器不共享；它不调用后端，也不是实际生产系统。
- `compose.yaml` + `deploy/Caddyfile` 是**未来真正线上系统的部署方案**（PostgreSQL、FastAPI、worker、Caddy/HTTPS），不能把它误认作当前 Pages 的运行环境。接手时先核实是否另有实际生产实例，不能仅凭这些文件声称已部署。

## 2. 三种工作模式

| 模式 | 启动/构建 | 数据与用途 | 对外地址 |
| --- | --- | --- | --- |
| 静态预览 | 在 `frontend` 目录设置 `VITE_PREVIEW_MODE=true` 后构建，或由 GitHub Actions 自动构建 | `preview.ts` + 浏览器 `localStorage`；给他人体验界面与交互 | <https://hasoy624-source.github.io/product-hub/> |
| 本地后端演示 | 仓库根目录运行 `./setup.ps1`、`./start.ps1` | `APP_MODE=demo`；FastAPI + 本地 SQLite `backend/product-hub.db`，按需启动 worker；用于端到端开发 | `http://127.0.0.1:8010`（可用 `./start.ps1 -Port 8011`） |
| 正式服务模板 | 配置 `.env` 后用 `docker compose` 构建/启动 | `APP_MODE=production`；PostgreSQL + 身份验证 + worker，Caddy 提供 HTTPS | `https://<DOMAIN>`，仅在实际部署并验证后成立 |

Windows PowerShell 示例；所有命令从仓库根目录开始：

```powershell
# 首次本地后端演示：安装 Python/Node 依赖并构建前端
.\setup.ps1
.\start.ps1

# 热更新开发：终端 A 运行 .\start.ps1；终端 B 运行 Vite，访问 5173 端口
cd frontend
npm.cmd run dev

# 单独构建与检查 Pages 同款静态预览（在 frontend 目录）
$env:VITE_PREVIEW_MODE = 'true'
npm.cmd test
npm.cmd run build -- --base=/product-hub/
Remove-Item Env:VITE_PREVIEW_MODE
```

`frontend/vite.config.ts` 把开发态 `/api` 代理到 `127.0.0.1:8010`。普通 `npm.cmd run build` **不**自动开启静态预览模式；没有 `VITE_PREVIEW_MODE=true` 时，前端会请求同源 `/api`，需要 FastAPI。若 PowerShell 执行策略限制脚本，使用适合当前机器的进程级策略或直接运行脚本内容，不要改仓库默认部署模式。

## 3. 代码地图

- `frontend/src/App.tsx`：应用布局、导航与主页面路由；`frontend/src/styles.css`：全局视觉样式。
- `frontend/src/ExceptionCenter.tsx`、`frontend/src/exceptions.ts`：异常总览与任务/项目/信号明细；当前界面使用 hash 路由（例如 `/#exceptions`、`/#exceptions/tasks`）。
- `frontend/src/ProductBoard.tsx`、`ProjectBoard.tsx`、`KnowledgeBase.tsx`、`classification.ts`：产品销售分类、项目看板、阶段知识库、分类配置。
- `frontend/src/api.ts`：预览/真实 API 的切换点；`frontend/src/preview.ts`：静态演示的模拟 API、种子数据和浏览器存储。新增功能须检查两种分支的行为是否一致。
- `backend/app/main.py`：API、模式设置、会话认证、路由；`models.py`/`schemas.py`：数据模型与校验；`seed.py`：演示数据；`worker.py`：后台任务。
- `backend/tests/` 与 `frontend/tests/`：回归测试。`docs/` 存放本地知识库/流程资料，但被 `.gitignore` 排除，不能假设克隆仓库后存在。

## 4. 从代码到线上预览的路径

1. 在 `main` 对应的工作树改动前，运行 `git status --short`、`git pull --ff-only origin main`；保留本机未跟踪/被忽略的数据库、资料、构建产物。
2. 修改代码时同步考虑 `preview.ts` 与真实 API；在 `frontend` 运行 `npm.cmd test`、`npm.cmd run build -- --base=/product-hub/`（预览验证前设置 `VITE_PREVIEW_MODE=true`），后端变更再运行 `backend/.venv/Scripts/python.exe -m pytest backend/tests`（从仓库根目录）。
3. 只暂存意图提交的文件，运行 `git diff --cached --check` 和 `git diff --cached --stat`，再提交、`git push origin main`。
4. [部署工作流](https://github.com/hasoy624-source/product-hub/actions/workflows/deploy-preview.yml) **仅在 `main` 的 `frontend/**` 或工作流文件变化时自动触发**；也支持 `workflow_dispatch` 手动运行。它使用 Node 24、`npm ci`、`npm test`、`VITE_PREVIEW_MODE=true` 和 `--base=/product-hub/`，将 `frontend/dist` 发布至 Pages。
5. 等待最新 workflow 的 `build` 与 `deploy` 均成功，再访问 [线上预览](https://hasoy624-source.github.io/product-hub/) 验证首页、关键页面和静态资源。只有提交 MD、后端或其他未匹配路径时，**不会自动更新 Pages**；需要手动运行 workflow，或下次前端变更时部署。即使手动部署，Pages 仍只是静态演示。

GitHub Pages 使用子路径 `/product-hub/`，构建时不可省略 `--base=/product-hub/`。不要把 `localhost:5173`、`localhost:8010`、Pages URL 和未来的 `https://<DOMAIN>` 混为一谈。

## 5. 真正线上服务的部署路径（当前仅模板）

`Dockerfile` 先构建前端，再制作 Python 运行镜像；`compose.yaml` 启动 `db`、`api`、`worker`、`caddy`；`deploy/Caddyfile` 把域名的 HTTPS 请求反向代理到 API，API 同时服务前端构建文件。部署机器需要域名 DNS 指向服务器并开放 80/443。

```bash
cp .env.example .env                 # 在部署机填写 DOMAIN、POSTGRES_PASSWORD、ADMIN_USERNAME、ADMIN_PASSWORD
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 api worker caddy
curl -fsS https://<DOMAIN>/api/health
```

生产配置由 `backend/app/main.py` 校验：`APP_MODE=production`、管理员账号、非模板且至少 12 字符的密码、HTTPS `PUBLIC_ORIGIN`；`DATABASE_URL` 在 Compose 中指向 PostgreSQL。`.env`、数据库、日志、备份和密钥都不能提交。真实上线前还应完成实际域名/证书、权限、数据迁移、备份恢复及端到端验收；当前 Pages 不提供这些能力。

## 6. 接手完成判据

- 能指出当前修改属于静态预览、后端演示还是正式服务模板，并找到对应入口文件。
- 能在本地复现前端测试、目标模式的构建；后端变更能运行对应测试。
- 能核对 `git status`、提交范围、远端 `main` 和 GitHub Actions 的最新部署结果。
- 能说明预览数据的存储边界，并将已验证的 URL/运行结果交给下一位接手者，而不是仅报告“已推送”。

## 7. 实际 Excel 项目空间（本地持久化）

- 入口：`start-projects.ps1`，默认 `http://127.0.0.1:8011/#projects`；后端模块 `app.project_workspace`，不执行演示 seed，也不启动演示 worker。
- 数据：`backend/project-workspace.db`；原图：`backend/import-assets/`。两者被 Git 忽略，不能打包进 Pages 或提交到公共仓库。
- `start.ps1` 仍是原来的演示数据库/模式，不要混用。SQLite 项目空间在本机刷新、换浏览器、重启服务后保留。
- 导入：从 `backend` 运行 `.venv/Scripts/python.exe -m app.import_projects <LOCAL_REGISTER.xlsx>`。按项目号不区分大小写合并，保留全部原表记录、隐藏页、图片、节点及履历；主总表为当前依据。导入后一次性迁移为原生业务记录，不显示工作表/单元格资料。
- 同一文件重导跳过现有项目/任务，保留用户后续编辑；不同来源碰到已有项目会整体回滚，不静默覆盖。没有负责人、日期和进度时保留空缺，不按阶段估算进度或制造任务期限。
- 本地构建：清除 `VITE_PREVIEW_MODE` 后，从根目录运行 `npm.cmd --prefix frontend run build -- --base=/ --outDir dist-local`，再运行 `./start-projects.ps1`。
- 原生详情 API：`GET /api/projects/{id}/details`；项目资料支持嵌套 `profile` 的 POST/PATCH；节点 `milestones`、动态 `updates` 可新增/编辑；`milestone-template` 补齐标准节点；`images` 接受原始图片请求体。原图读取 `GET /api/project-assets/{hash-filename}`。完整问题措施存在原生 `TaskContent`，任务 POST/PATCH 接受 `description`。
- `native_project_migration.py` 在启动与导入时进行幂等的一次迁移：新增 `ProjectProfile`、`ProjectMilestone`、`ProjectUpdate`、`ProjectImage`、`TaskContent`，不修改既有 Project/Task 列结构。存在 profile 的项目不再从导入台账覆盖；资料维护以后只写原生表。`ProjectSource` 留作内部导入台账，不作为运行界面依赖。未标明计划/实际的节点日期保留在可编辑“节点记录”中，不当成实际完成。
- 项目工作区统一为“概况 / 节点计划 / 问题与任务 / 项目动态”，包括后续手工新建项目。静态预览同样维护原生 profile 与 project_details，但不带入实际项目数据库。
- 项目页布局由 `ProjectNavigator.tsx`（列表/搜索）、`ProjectBoard.tsx`（快捷筛选与下拉）、`ProjectWorkspace.tsx`（详情）组成。桌面 `.project-workbench` 使用等高双栏，只有 `.project-list-scroll` 与 `.native-panel` 内部滚动；不要重新只把左栏设为 sticky，或恢复两块各自按内容撑高。900px 以下使用列表/详情切换和“返回项目列表”。概况先展示待推进，团队/图片/阶段路径/自定义字段属于次级资料；五阶段标记不推断节点完成。
- 如需真正多人协作，迁移到已有正式服务模板及受控的数据空间；静态 GitHub Pages 继续使用演示数据。
