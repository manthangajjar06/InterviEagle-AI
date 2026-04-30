<div align="center">

# 🦅 InterviEagle

**It hears before you hear. It answers before you think.**

An AI-powered real-time interview copilot for Google Meet.

[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Userscript-00485B?logo=tampermonkey&logoColor=white)](https://www.tampermonkey.net/)
[![Groq](https://img.shields.io/badge/Groq-LLM_Inference-F55036?logo=groq&logoColor=white)](https://console.groq.com)
[![LLaMA](https://img.shields.io/badge/LLaMA_3.3-70B-7B68EE?logo=meta&logoColor=white)](https://groq.com)
[![Google Meet](https://img.shields.io/badge/Google_Meet-Integration-00897B?logo=googlemeet&logoColor=white)](https://meet.google.com)

</div>

---

InterviEagle silently scrapes Google Meet's native captions, pipes them through **Groq's LLaMA 3.3 70B**, and renders structured, interview-ready answers in a floating overlay — zero audio processing, zero transcription costs, sub-2s end-to-end latency.

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Architecture](#architecture)
- [Code Structure](#code-structure)
- [Version History](#version-history)
- [Disclaimer](#disclaimer)

---

## How It Works

```
Interviewer speaks
    → Google Meet generates captions (native STT, zero latency)
    → MutationObserver detects caption text in the DOM
    → Smart filtering: only elements with 2+ text changes (live captions, not UI)
    → Sentence deduplication via prefix tracking
    → Transcript cleanup (filler removal, STT corrections)
    → Groq LLaMA 3.3 70B generates a structured answer (~1.5s)
    → Markdown-rendered response in a glassmorphic overlay
```

The key insight: **Google Meet already transcribes everything.** Instead of building a complex audio pipeline, InterviEagle simply reads the captions Google already generates — then hides them and shows AI-generated answers instead.

---

## Features

| Category | Feature |
|----------|---------|
| **Transcription** | Zero-latency caption scraping via DOM `MutationObserver` |
| **AI Engine** | Groq LLaMA 3.3 70B with structured interview prompts |
| **Answer Frameworks** | Technical, behavioral (STAR), coding, system design, small talk |
| **Resume Context** | Paste your resume; AI references your real projects and skills |
| **Stealth** | Native captions hidden; only the overlay is visible |
| **Manual Input** | Type questions directly when captions miss something |
| **UI** | Draggable glassmorphic panel with glow animation |
| **Reliability** | Auto-retry (2×), rate limiting (2s cooldown), context memory (10 msgs) |

---

## Quick Start

### Prerequisites

- Chrome, Edge, or Firefox
- [Tampermonkey extension](https://www.tampermonkey.net/) installed
- Free [Groq API key](https://console.groq.com) (no credit card required)

### Installation

**1.** Install Tampermonkey from your browser's extension store:

| Browser | Link |
|---------|------|
| Chrome | [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
| Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) |

**2.** Get your Groq API key:
- Sign up at [console.groq.com](https://console.groq.com) (Google/GitHub login)
- Go to **API Keys** → **Create API Key** → copy (starts with `gsk_...`)

**3.** Create the userscript:
- Click Tampermonkey icon → **Create a new script**
- Delete the default template
- Paste the contents of [`script.js`](script.js)
- Replace the API key on **line 18**:

```javascript
var GROQ_API_KEY = 'gsk_your_actual_key_here';
```

- **Ctrl+S** to save

**4.** Join a Google Meet call → panel appears in ~3s → click **Start**.

---

## Configuration

All configuration is in the `CONFIG` block (lines 17–22):

```javascript
var GROQ_API_KEY    = 'YOUR_GROQ_API_KEY_HERE';
var LLM_MODEL       = 'llama-3.3-70b-versatile';
var ROLE            = 'AI/ML Junior Developer';   // your target role
var COMPANY         = 'Google';                    // target company
var FINALIZE_DELAY  = 1500;                        // ms before finalizing a sentence
```

**Resume:** Click the `Resume` button in the panel header → paste your resume text → `Save`. Persisted via `GM_setValue` across sessions.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + P` | Toggle panel visibility |
| `Alt + C` | Clear conversation history |
| `Enter` | Submit typed question |
| Header drag | Reposition panel |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  GOOGLE MEET                                                │
│                                                             │
│  Interviewer speaks → Native STT → Caption DOM elements     │
│       │                                                     │
│  ┌────▼───────────────────────────────────────────────┐     │
│  │  TAMPERMONKEY USERSCRIPT                            │     │
│  │                                                     │     │
│  │  MutationObserver ──► trackElement() ──► filter     │     │
│  │       │                                             │     │
│  │       ▼                                             │     │
│  │  extractNewText() ──► cleanTranscript() ──► AI      │     │
│  │       │                                             │     │
│  │       ▼                                             │     │
│  │  GM_xmlhttpRequest ────► Groq API (LLaMA 3.3 70B)  │     │
│  │       │                                             │     │
│  │       ▼                                             │     │
│  │  renderMd() ──► Glassmorphic overlay panel          │     │
│  └─────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Design Decisions

| Decision | Why |
|----------|-----|
| `@run-at document-idle` | Meet's DOM must be fully loaded before injection |
| `GM_xmlhttpRequest` | Bypasses Meet's Content Security Policy (CORS) |
| `opacity: 0` for hiding captions | `display: none` would stop DOM mutations from firing |
| Change-count ≥ 2 filter | Static UI text appears once; live captions grow word-by-word |
| Prefix-based deduplication | Meet appends new sentences to the same DOM element |
| 1500ms finalize delay | Balances speed vs. capturing the complete sentence |
| Trusted Types policy | Meet enforces Trusted Types; `safeHTML()` handles this |

---

## Code Structure

```
script.js (~420 lines)
│
├─ CONFIG ─────────────── API key, model, role, company
├─ STATE ──────────────── Observer refs, caption tracking, conversation history
│
├─ §1 CAPTION SCRAPING
│   ├─ enableCaptions()    Click the caption toggle button
│   ├─ startObserver()     MutationObserver on document.body
│   ├─ trackElement()      Filter + change-count tracking
│   ├─ extractNewText()    Prefix deduplication
│   ├─ handleCaption()     Interim display + finalize timer
│   └─ finalizeCaption()   Clean → send to AI
│
├─ §2 SYSTEM PROMPT
│   └─ buildSystemPrompt() Multi-framework interview prompt
│
├─ §3 GROQ LLM
│   └─ sendToAI()          Rate-limited API call with 2× retry
│
├─ §4 HELPERS
│   ├─ safeHTML()          Trusted Types-safe innerHTML
│   ├─ renderMd()          Markdown → HTML (bold, code, lists)
│   └─ el()                DOM element factory
│
└─ §5 UI
    ├─ initUI()            Panel construction + event binding
    ├─ Drag system         mousedown / mousemove / mouseup
    ├─ Resume modal        Paste + persist resume text
    └─ boot()              DOM-ready initialization
```

---

## Version History

### v10.0 — Caption Scraping *(current)*

Complete architecture pivot. Replaced audio capture with Google Meet's native caption DOM scraping.

- Zero-latency transcription (no audio processing)
- Zero transcription costs (no Whisper API)
- Sentence-level deduplication
- All speech types answered (including greetings)
- Glassmorphic UI with glow animations

### v8.0 — WebRTC + Whisper + VAD

Intercepted remote audio via `RTCPeerConnection` patching. Custom Voice Activity Detection engine with adaptive noise floor. Batch transcription via Groq Whisper API.

- **Why replaced:** Complex audio pipeline (~500 lines), API costs for transcription, ~1.5s latency per chunk.

### v2.0 — Web Speech API

Used Chrome's `webkitSpeechRecognition` with Groq LLM for answer generation.

- **Why replaced:** Web Speech API only captures the local microphone — cannot access remote participant audio from WebRTC streams.

---

## Security

> **⚠️ Never commit your API key.** The published `script.js` contains a placeholder (`YOUR_GROQ_API_KEY_HERE`). Replace it locally after installing. The `.gitignore` excludes development files with real keys.

---

## Limitations

> **🚧 This project is currently in beta.**

| Limitation | Details |
|------------|---------|
| **Platform** | Google Meet only (Zoom, Teams, etc. not yet supported) |
| **Browser** | Google Chrome only (Tampermonkey + caption DOM structure is Chrome-specific) |
| **Language** | English transcription only (depends on Meet's caption language setting) |
| **Captions** | Requires Google Meet's caption feature to be available in your account |
| **AI Model** | Requires a valid Groq API key (free tier has rate limits) |

Support for additional platforms and browsers is planned for future releases.

---

## Disclaimer

This project is for **educational and personal practice purposes only**. It demonstrates DOM scraping, userscript development, and LLM API integration. The author assumes no responsibility for how it is used. Use responsibly.

---

<div align="center">

**Built with precision** · From WebRTC hooks to caption scraping, every iteration got faster.

</div>
