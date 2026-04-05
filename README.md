# LarkBridge

[中文文档](./README.zh.md)

> Sync Feishu/Lark Minutes to Obsidian with one click.

LarkBridge brings your Feishu meeting notes, transcripts, and recordings into your Obsidian vault — automatically formatted as clean Markdown.

## Features

- **One-click sync** — click the bridge icon in the sidebar, or use the command palette
- **Meeting notes** — AI-generated summaries from Feishu Minutes
- **Transcripts** — full verbatim transcripts with timestamps
- **Recordings** — audio/video files downloaded alongside notes
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
git clone https://github.com/Clawborn/lark-bridge.git
cd lark-bridge
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder.

## Usage

1. Click the **bridge icon** in the left sidebar (or `Cmd/Ctrl+P` → "Sync Lark Minutes")
2. LarkBridge searches your Feishu account for new meeting notes and transcripts
3. New files are downloaded, cleaned, and saved to your configured sync directory
4. Recordings are downloaded for meetings longer than the configured minimum
5. Images and whiteboard thumbnails are cached locally and embedded

## File naming

```
2026-03-27_AI-startup-interview_notes.md
2026-03-27_AI-startup-interview_transcript.md
2026-03-27_AI-startup-interview_recording_25m30s.mp4
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Sync directory | `LarkBridge` | Folder for synced files (relative to vault root) |
| Assets subdirectory | `assets` | Subfolder for images and whiteboards |
| Skip recordings under | `5` min | Don't download short recordings |

## How it works

LarkBridge calls `lark-cli` under the hood to:

1. **Search** Feishu docs for meeting notes and transcripts
2. **Fetch** document content via `lark-cli docs +fetch`
3. **Clean** Feishu proprietary tags (`<grid>`, `<column>`, `<text>`, `<whiteboard>`, `<image>`, `<add-ons>`, etc.) into standard Markdown
4. **Download** images and whiteboard thumbnails via `lark-cli docs +media-download`
5. **Download** recordings via `lark-cli minutes +download` + `curl`

## Tag conversion reference

| Feishu tag | Converted to |
|------------|-------------|
| `<image token="..."/>` | `![[assets/token.png]]` (downloaded) |
| `<whiteboard token="..."/>` | `![[assets/token.png]]` (thumbnail) |
| `<grid>` / `<column>` | Removed (content preserved) |
| `<quote-container>` | `>` blockquote |
| `<text color="gray">` | `` `timestamp` `` |
| `<text color="gray" bgcolor="gray">` | `**@mention**` |
| `<mention-user>` | Removed |
| `<add-ons>` | Removed |
| `<callout>` | `>` blockquote |

## License

MIT

## Authors

[@Clawborn](https://github.com/Clawborn) & [@clawyouseeme](https://github.com/clawyouseeme)
