# LarkBridge

[English](./README.md)

> 一键同步飞书妙记到 Obsidian

LarkBridge 将你的飞书会议纪要、逐字稿和录音同步到 Obsidian Vault，自动转换为干净的 Markdown 格式。

## 功能

- **一键同步** — 点击侧边栏图标，或使用命令面板
- **智能纪要** — 飞书 AI 生成的会议摘要
- **逐字稿** — 完整的带时间戳的文字记录
- **录音** — 音频/视频文件与纪要一同下载
- **图片和白板** — 自动下载并嵌入
- **智能命名** — 文件按 `日期_主题_类型` 格式命名，方便浏览
- **增量同步** — 只下载新内容，已有文件自动跳过
- **标签清洗** — 将飞书私有 HTML 标签转换为标准 Markdown
- **可配置** — 自定义同步目录、图片目录、最短录音时长

## 前置条件

1. 安装并登录 **[lark-cli](https://github.com/larksuite/cli)**：

```bash
npm install -g @larksuite/cli
lark-cli config init
lark-cli auth login --recommend
```

2. **Obsidian** 1.0.0+

## 安装

### 手动安装

1. 下载最新 Release（`main.js`、`manifest.json`、`styles.css`）
2. 在 Vault 中创建文件夹：`<vault>/.obsidian/plugins/lark-bridge/`
3. 将三个文件复制进去
4. 在 Obsidian → 设置 → 社区插件 中启用 **LarkBridge**

### 从源码构建

```bash
git clone https://github.com/Clawborn/lark-bridge.git
cd lark-bridge
npm install
npm run build
```

将 `main.js`、`manifest.json` 和 `styles.css` 复制到 Vault 的插件目录。

## 使用方法

1. 点击左侧栏的 **桥梁图标**（或 `Cmd/Ctrl+P` → 输入"同步飞书妙记"）
2. LarkBridge 自动搜索飞书账号中的新会议纪要和逐字稿
3. 新文件下载后自动清洗标签，保存到配置的同步目录
4. 超过设定时长的录音自动下载
5. 图片和白板缩略图缓存到本地并嵌入文档

## 文件命名规则

```
2026-03-27_AI创业项目及发展前景访谈_纪要.md
2026-03-27_AI创业项目及发展前景访谈_逐字稿.md
2026-03-27_AI创业项目及发展前景访谈_录音_25m30s.mp4
```

同一场会议的纪要、逐字稿、录音紧挨在一起，按文件名排序即为时间线。

## 设置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| 同步目录 | `LarkBridge` | 同步文件保存位置（相对于 Vault 根目录） |
| 图片子目录 | `assets` | 图片和白板缩略图保存位置 |
| 最短录音时长 | `5` 分钟 | 短于此时长的录音不下载 |

## 工作原理

LarkBridge 底层调用 `lark-cli` 完成所有操作：

1. **搜索** — 在飞书云文档中搜索"智能纪要"和"文字记录"
2. **获取内容** — 通过 `lark-cli docs +fetch` 拉取文档内容
3. **清洗标签** — 将飞书私有标签（`<grid>`、`<column>`、`<text>`、`<whiteboard>`、`<image>`、`<add-ons>` 等）转换为标准 Markdown
4. **下载图片** — 通过 `lark-cli docs +media-download` 下载图片和白板缩略图
5. **下载录音** — 通过 `lark-cli minutes +download` 获取下载链接，`curl` 下载

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

## 许可证

MIT

## 作者

[@Clawborn](https://github.com/Clawborn) & [@clawyouseeme](https://github.com/clawyouseeme)
