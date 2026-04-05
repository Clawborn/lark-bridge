# LarkBridge

> Sync Feishu/Lark Minutes to Obsidian with one click.

LarkBridge brings your Feishu meeting notes, transcripts, and recordings into your Obsidian vault — automatically formatted as clean Markdown.

## Features

- **One-click sync** — click the bridge icon in the sidebar, or use the command palette
- **Meeting notes** (智能纪要) — AI-generated summaries from Feishu Minutes
- **Transcripts** (逐字稿) — full verbatim transcripts with timestamps
- **Recordings** (录音) — audio/video files downloaded alongside notes
- **Images & whiteboards** — automatically downloaded and embedded
- **Smart naming** — files named as `YYYY-MM-DD_topic_type` for easy browsing
- **Incremental sync** — only downloads new content, skips what you already have
- **Tag cleaning** — converts Feishu's proprietary HTML tags to standard Markdown
- **Configurable** — choose sync directory, assets folder, minimum recording length

## Prerequisites

1. **[lark-cli](https://github.com/larksuite/cli)** installed and logged in:

```bash
npm install -g @larksuite/cli
lark-cli config init
lark-cli auth login --recommend
```

2. **Obsidian** 1.0.0+

## Installation

### Manual

1. Download the latest release (`main.js`, `manifest.json`, `styles.css`)
2. Create folder: `<vault>/.obsidian/plugins/lark-bridge/`
3. Copy the three files into it
4. Enable **LarkBridge** in Obsidian → Settings → Community plugins

### Build from source

```bash
git clone https://github.com/clawborn/lark-bridge.git
cd lark-bridge
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder.

## Usage

1. Click the **bridge icon** in the left sidebar (or `Cmd/Ctrl+P` → "同步飞书妙记")
2. LarkBridge searches your Feishu account for new meeting notes and transcripts
3. New files are downloaded, cleaned, and saved to your configured sync directory
4. Recordings are downloaded for meetings longer than the configured minimum
5. Images and whiteboard thumbnails are cached locally and embedded

## File naming

```
2026-03-27_AI创业项目及发展前景访谈_纪要.md
2026-03-27_AI创业项目及发展前景访谈_逐字稿.md
2026-03-27_AI创业项目及发展前景访谈_录音_25m30s.mp4
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Sync directory | `LarkBridge` | Folder for synced files (relative to vault root) |
| Assets subdirectory | `assets` | Subfolder for images and whiteboards |
| Skip recordings under | `5` min | Don't download short recordings |

## How it works

LarkBridge calls `lark-cli` under the hood to:

1. **Search** Feishu docs for "智能纪要" and "文字记录"
2. **Fetch** document content via `lark-cli docs +fetch`
3. **Clean** Feishu proprietary tags (`<grid>`, `<column>`, `<text>`, `<whiteboard>`, `<image>`, `<add-ons>`, etc.) into standard Markdown
4. **Download** images and whiteboard thumbnails via `lark-cli docs +media-download`
5. **Download** recordings via `lark-cli minutes +download` (URL) + `curl`

## Tag conversion reference

| Feishu tag | Converted to |
|------------|-------------|
| `<image token="..."/>` | `![[assets/token.png]]` (image downloaded) |
| `<whiteboard token="..."/>` | `![[assets/token.png]]` (thumbnail downloaded) |
| `<grid>` / `<column>` | Removed (content preserved) |
| `<quote-container>` | `>` blockquote |
| `<text color="gray">` | `` `timestamp` `` |
| `<text color="gray" bgcolor="gray">` | `**@mention**` |
| `<mention-user>` | Removed |
| `<add-ons>` | Removed |
| `<callout>` | `>` blockquote |

## License

MIT

## Author

**Rain** ([@clawyouseeme](https://github.com/clawyouseeme))
