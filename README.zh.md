# LarkBridge

[English](./README.md)

> 一键同步飞书妙记到 Obsidian

LarkBridge 将飞书的会议纪要、逐字稿和录音同步到你的 Obsidian Vault，自动转换为干净的 Markdown 格式。

## 功能

- **一键同步** — 点击侧边栏 ↻ 图标，或用命令面板
- **智能纪要** — 飞书 AI 生成的会议摘要
- **逐字稿** — 带时间戳的完整文字记录
- **录音下载** — 音频/视频文件与笔记一同保存
- **图片和白板** — 自动下载并嵌入文档
- **智能命名** — 文件按 `日期_主题_类型` 格式排列
- **增量同步** — 只下载新内容，不重复下载
- **标签清洗** — 飞书私有标签自动转标准 Markdown
- **双模式** — 支持纯 API（不需要终端）和 lark-cli 两种方式

---

## 快速开始

### 方式一：飞书 API（推荐，不需要终端）

#### 第 1 步：创建飞书应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app)
2. 点击 **创建自建应用**
3. 填写应用名称（如 "LarkBridge"）和描述，点击 **创建**
4. 在应用主页可以看到 **App ID** 和 **App Secret**，复制备用

#### 第 2 步：开通权限

1. 在应用页面左侧菜单，点击 **权限管理**
2. 逐个搜索并开通以下权限：

| 权限 | 用途 |
|------|------|
| `search:docs:read` | 搜索会议纪要 |
| `docx:document:readonly` | 读取文档内容 |
| `docs:document.content:read` | 读取文档块内容 |
| `docs:document.media:download` | 下载文档中的图片 |
| `docs:document:export` | 导出文档 |
| `drive:file:download` | 下载云空间文件 |
| `vc:meeting.search:read` | 搜索会议记录 |
| `vc:note:read` | 读取会议纪要 |
| `minutes:minutes:readonly` | 读取妙记内容 |
| `minutes:minutes.media:export` | 下载妙记录音 |

3. 添加完所有权限后，在左侧 **版本管理与发布** 中点击 **创建版本**
4. 填写版本信息并提交
5. 个人使用的话，在 **应用发布** 中将状态设为 **测试中** 或自行审批

> **注意**：如果你在企业组织中，可能需要管理员审批。个人飞书账号通常可以自助审批。

#### 第 3 步：安装和配置 LarkBridge

1. 从 [GitHub Releases](https://github.com/Clawborn/lark-bridge/releases) 下载 `main.js`、`manifest.json`、`styles.css`
2. 在 Obsidian Vault 中创建文件夹：`.obsidian/plugins/lark-bridge/`
3. 将三个文件复制进去
4. 打开 Obsidian → **设置** → **社区插件** → 关闭 **安全模式** → 启用 **LarkBridge**
5. 打开 LarkBridge 设置，展开 **Method 1: Feishu API**
6. 粘贴你的 **App ID** 和 **App Secret**
7. 点击 **Login** → 浏览器弹出授权页面
8. 登录飞书账号并授权
9. 回到 Obsidian，状态栏变 **绿色** 即为成功

#### 第 4 步：同步！

点击左侧栏 **↻ 图标**，或按 `Cmd/Ctrl+P` → 输入 "同步飞书妙记"。

---

### 方式二：lark-cli（适合终端用户）

如果你更习惯命令行：

```bash
# 1. 安装 lark-cli
npm install -g @larksuite/cli

# 2. 创建飞书应用（交互式引导）
lark-cli config init

# 3. 登录并授权常用权限
lark-cli auth login --recommend

# 4. 验证登录状态
lark-cli auth status
```

然后回到 Obsidian，打开 LarkBridge 设置 → 点 **Refresh** → 状态变绿即可。

---

## 使用方法

### 同步

三种触发方式：
- **侧边栏**：点击左侧 ↻ 图标
- **命令面板**：`Cmd/Ctrl+P` → "同步飞书妙记 (Sync Lark Minutes)"
- **设置页**：滚到底部点击 "Start sync"

同步时 LarkBridge 会：
1. 搜索飞书中新增的会议纪要和逐字稿
2. 只下载新文件（增量同步）
3. 清理飞书私有标签为标准 Markdown
4. 下载文档中的图片和白板缩略图
5. 下载超过设定时长的录音

### 文件命名规则

```
2026-03-27_AI创业项目及发展前景访谈_纪要.md
2026-03-27_AI创业项目及发展前景访谈_逐字稿.md
2026-03-27_AI创业项目及发展前景访谈_录音_25m30s.mp4
```

同一场会议的纪要、逐字稿、录音紧挨在一起，按文件名排序就是时间线。

### 设置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| Sync directory | `LarkBridge` | 同步文件保存位置（相对于 Vault 根目录） |
| Assets subdirectory | `assets` | 图片和白板缩略图保存位置 |
| Skip recordings under | `5` 分钟 | 短于此时长的录音不下载 |

---

## 常见问题

### 填了凭证但还是显示 "Not connected"

- 确认复制的是 **App Secret**，不是 App ID
- 确认飞书应用已开通上面列出的所有权限
- 企业账号需要管理员审批应用，或使用测试模式

### Login 按钮一直转圈

- 确认在浏览器中完成了授权
- 检查网络连接
- 重新点 Login 试试——设备码 10 分钟后过期

### 报 "Request failed, status 404"

- 这是早期版本的 bug，请更新到最新版本

### 同步完成但找到 0 个文档

- 确认飞书账号中有妙记（会议录音记录）
- 确认应用已开通 `search:docs:read` 权限
- 插件搜索的是"智能纪要"和"文字记录"——这些由飞书妙记自动生成

### 图片显示为 `[飞书图片: xxx]` 而不是真实图片

- 需要 `docs:document.media:download` 权限
- CLI 模式下确认 lark-cli 有对应权限

### 录音下载失败

- 需要 `minutes:minutes.media:export` 权限
- 只能下载你是组织者或有权限的会议录音
- 录音通过 `curl` 下载，确保系统有 `curl` 命令

### 飞书标签显示异常（竖排文字等）

- 这是飞书私有标签导致的，LarkBridge 会自动清理
- 如果是旧文件，可以重新同步或手动删除后重新下载

---

## 工作原理

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Obsidian   │────▶│  LarkBridge  │────▶│   飞书 API   │
│  (你的 Vault) │◀────│   (插件)     │◀────│  / lark-cli  │
└─────────────┘     └──────────────┘     └──────────────┘
                           │
                     ┌─────┴─────┐
                     │ 清理标签    │
                     │ 下载图片    │
                     │ 智能命名    │
                     └───────────┘
```

1. **搜索** — 在飞书中搜索"智能纪要"和"文字记录"
2. **获取** — 拉取文档内容
3. **清洗** — 将飞书私有标签转标准 Markdown
4. **下载** — 图片、白板缩略图
5. **录音** — 通过 URL + curl 下载
6. **保存** — 按 `日期_主题_类型` 智能命名

## 标签转换对照表

| 飞书标签 | 转换结果 |
|----------|----------|
| `<image token="..."/>` | `![[assets/token.png]]`（图片已下载） |
| `<whiteboard token="..."/>` | `![[assets/token.png]]`（缩略图已下载） |
| `<grid>` / `<column>` | 删除标签，保留内容 |
| `<quote-container>` | `>` 引用块 |
| `<text color="gray">` | `` `时间戳` `` |
| `<text color="gray" bgcolor="gray">` | `**@提及**` |
| `<mention-user>` | 删除 |
| `<add-ons>` | 删除 |
| `<callout>` | `>` 引用块 |

## 网络与隐私

LarkBridge 连接的服务：
- `accounts.feishu.cn` — OAuth 设备授权登录
- `open.feishu.cn` — 飞书开放 API（搜索、获取文档、下载媒体）
- 你的应用凭证存储在本地 Obsidian 插件数据中（`.obsidian/plugins/lark-bridge/data.json`）
- **不会向任何第三方服务发送数据**

## 从源码构建

```bash
git clone https://github.com/Clawborn/lark-bridge.git
cd lark-bridge
npm install
npm run build
```

将 `main.js`、`manifest.json`、`styles.css` 复制到 `<vault>/.obsidian/plugins/lark-bridge/`。

## 许可证

MIT

## 作者

[@Clawborn](https://github.com/Clawborn) & [@clawyouseeme](https://github.com/clawyouseeme)
