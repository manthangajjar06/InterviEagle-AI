# 🦅InterviEagle AI

**It hears before you hear. It answers before you think.**

An AI-powered real-time interview copilot for Google Meet.

[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Userscript-00485B?logo=tampermonkey&logoColor=white)](https://www.tampermonkey.net/)
[![Groq](https://img.shields.io/badge/Groq_API-LLM_Inference-F55036?logo=groq&logoColor=white)](https://console.groq.com)
[![LLaMA](https://img.shields.io/badge/LLaMA_3.3-70B_Versatile-7B68EE?logo=meta&logoColor=white)](https://groq.com)
[![Google Meet](https://img.shields.io/badge/Google_Meet-Caption_Scraping-00897B?logo=googlemeet&logoColor=white)](https://meet.google.com)

InterviEagle is a Tampermonkey userscript that scrapes Google Meet's native live captions, extracts new speech segments through a multi-strategy deduplication pipeline, and generates structured interview answers via Groq's LLaMA 3.3 70B model. The response is rendered in a draggable glassmorphic overlay directly on top of the Meet interface — zero audio processing, zero transcription costs, sub-2 second end-to-end latency.

---

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Usage](#usage)
- [Caption Detection Engine](#caption-detection-engine)
- [System Prompt Design](#system-prompt-design)
- [Code Structure](#code-structure)
- [Version History](#version-history)
- [Limitations](#limitations)
- [Security](#security)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)
- [License](#license)

---

## Architecture

```
Interviewer speaks
    → Google Meet generates captions (native STT, zero latency)
    → DOM MutationObserver scrapes caption text
    → Multi-strategy text extraction (prefix / suffix / length-diff)
    → Sentence deduplication and STT corrections
    → Groq API (LLaMA 3.3 70B, ~1.5s inference)
    → Markdown-rendered answer in overlay panel
```

```
┌──────────────────────────────────────────────────────────────┐
│  GOOGLE MEET                                                 │
│                                                              │
│  Interviewer speaks → Native STT → Caption DOM elements      │
│       │                                                      │
│  ┌────▼──────────────────────────────────────────────────┐   │
│  │  TAMPERMONKEY USERSCRIPT                               │   │
│  │                                                        │   │
│  │  MutationObserver ──► trackElement() ──► filter        │   │
│  │       │                                                │   │
│  │       ▼                                                │   │
│  │  extractNewText() ──► cleanTranscript()                │   │
│  │       │                  (STT fixes + filler removal)  │   │
│  │       ▼                                                │   │
│  │  GM_xmlhttpRequest ────► Groq API (LLaMA 3.3 70B)     │   │
│  │       │                                                │   │
│  │       ▼                                                │   │
│  │  renderMd() ──► Glassmorphic overlay panel             │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

The script auto-enables Google Meet's built-in captions, hides the native caption bar via CSS injection, and attaches a `MutationObserver` to `document.body` to detect live caption text. A 3-strategy extraction pipeline handles Google Meet's accumulated caption text — including retroactive STT corrections — using prefix matching, tail/suffix anchoring, and length-based diffing. A 1000-character sliding window keeps memory constant regardless of interview duration. Finalized sentences are cleaned, deduplicated, and sent to Groq's LLM with a structured interview-aware system prompt.

---

## Features

| Category | Description |
|----------|-------------|
| **Transcription** | Zero-latency caption scraping via DOM `MutationObserver`. No audio processing, no STT API costs. |
| **AI Engine** | Groq LLaMA 3.3 70B with category-aware prompting — technical, behavioral (STAR), coding, system design, small talk. |
| **Resume Context** | Paste resume text into the panel. The AI references your real projects, skills, and achievements in answers. |
| **Unlimited Duration** | 1000-character sliding window with periodic cleanup. The script never degrades, regardless of interview length. |
| **Stealth** | Native caption bar is hidden via `opacity: 0`. Only the InterviEagle overlay is visible. |
| **Manual Input** | Type questions directly into the panel when captions miss something. |
| **Draggable Panel** | Glassmorphic overlay with Inter font, grab-and-move header, glow animation, and live status indicators. |
| **Copy to Clipboard** | Hover over the answer area to reveal a copy button. One click copies the full answer. |
| **Regenerate** | Re-send the last captured question through the LLM without waiting for new speech. |
| **Persistent History** | 20-message conversation history (10 Q&A pairs) saved via `GM_setValue`. Survives page refreshes. |
| **Reliability** | Failed API calls retry up to 2 times with backoff. A 2-second rate limiter prevents API spam. |
| **Memory Management** | Stale DOM references are pruned every 15 seconds. A fallback caption scan runs every 3 seconds. |
| **Keyboard Shortcuts** | `Alt+P` toggles panel visibility. `Alt+C` clears conversation history. |

---

## Getting Started

### Prerequisites

- Google Chrome, Microsoft Edge, or Mozilla Firefox
- [Tampermonkey](https://www.tampermonkey.net/) browser extension
- Free API key from [Groq](https://console.groq.com) (no credit card required)

### Installation

1. Install Tampermonkey from your browser's extension store:

   | Browser | Link |
   |---------|------|
   | Chrome | [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
   | Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |
   | Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) |

2. Get a Groq API key:
   - Sign up at [console.groq.com](https://console.groq.com)
   - Navigate to **API Keys** → **Create API Key**
   - Copy the key (starts with `gsk_`)

3. Create the userscript:
   - Click the Tampermonkey icon → **Create a new script**
   - Delete the default template
   - Paste the entire contents of `script.js`
   - Replace the API key placeholder on line 18
   - Save with `Ctrl+S`

---

## Configuration

All configuration is in the `CONFIG` block at the top of `script.js` (lines 17–22):

```javascript
var GROQ_API_KEY    = 'YOUR_GROQ_API_KEY_HERE';   // Replace with your Groq key
var LLM_MODEL       = 'llama-3.3-70b-versatile';  // Groq-hosted LLaMA model
var ROLE            = 'AI/ML Junior Developer';    // Target role
var COMPANY         = 'Google';                    // Target company
var FINALIZE_DELAY  = 1500;                        // ms before finalizing a caption
```

**Resume:** Click the `Resume` button in the panel header. Paste your resume as plain text (up to 3000 characters) and click Save. The text is persisted via `GM_setValue` across sessions and injected into the system prompt for personalized behavioral answers.

---

## Usage

1. Join a Google Meet call. The overlay panel loads automatically within ~3 seconds.
2. Click **Start**. Captions are auto-enabled and the native caption bar is hidden.
3. The panel displays a green status dot and `Listening...` while capturing speech.
4. AI-generated answers appear in the panel within ~1.5 seconds of each finalized question.
5. Optionally, click **Resume** to paste your resume for context-aware answers.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + P` | Toggle panel visibility |
| `Alt + C` | Clear conversation history |
| `Enter` | Submit a manually typed question |
| Header drag | Reposition the panel |

---

## Caption Detection Engine

This is the core component that makes InterviEagle reliable for production-length interviews.

### Problem

Google Meet does not create new DOM elements per sentence. Instead, it appends all caption text into a single, continuously growing element. After approximately 2 minutes, this string exceeds 500 characters and keeps growing. Earlier versions of this script broke because they either capped text length at a fixed threshold or relied on simple prefix matching that failed when Meet retroactively corrected earlier words via STT.

### Solution: Multi-Strategy Extraction

The `extractNewText()` function implements a 3-strategy pipeline with automatic fallback:

| Strategy | Trigger Condition | Mechanism |
|----------|-------------------|-----------|
| **Prefix Match** | `fullText.startsWith(lastFinalizedText)` | Slices off the known prefix. Fastest path; works when STT has not modified earlier text. |
| **Tail/Suffix Match** | Prefix match fails (STT corrected earlier words) | Uses last 80 characters of `lastFinalizedText` as an anchor via `lastIndexOf()`. Extracts everything after the anchor. |
| **Length-Diff** | Both strategies above fail | Compares `fullText.length` vs `lastFinalizedLength`. Extracts the growth delta with sentence boundary detection. |

If none of the strategies yield new text (e.g., Meet only corrected old words without adding new speech), the update is silently ignored. No false positives.

### Durability and Self-Healing

| Feature | Mechanism | Purpose |
|---------|-----------|---------|
| 1000-char sliding window | `lastFinalizedText` stores only the last 1000 characters (~200 words) | Keeps memory constant for any interview length while providing a large anchor for suffix matching |
| Full length tracking | `lastFinalizedLength` stores the total transcript length as an integer | Enables the length-diff strategy even after the text window has slid forward |
| 30-second inactivity reset | `lastFinalizedText` resets to `""` after 30 seconds of silence | Prevents permanent blocking if the dedup state becomes stale |
| 15-second DOM cleanup | `textHistory` Map is pruned every 15 seconds | Garbage collects detached DOM elements to prevent memory leaks |
| 3-second fallback scan | All 12+ caption selectors are polled every 3 seconds | Catches caption elements that `MutationObserver` may have missed |
| 12+ caption selectors | `.a4cQT`, `.iOzk7`, `[jsname="tgaKEf"]`, `[aria-live]`, and others | Covers multiple Google Meet DOM versions for forward compatibility |
| DOM reattachment | Secondary `MutationObserver` on `document.body` | If Meet removes the overlay panel from the DOM, it is automatically re-appended |
| Change-count filter | Elements must have 2+ text changes before capture triggers | Filters out static UI text. Only live, actively changing captions are processed. |

---

## System Prompt Design

The system prompt is constructed by `buildSystemPrompt()` and adapts its answer framework based on the question type:

| Question Type | Framework |
|---------------|-----------|
| Technical / Conceptual | One-line definition → How it works (2–3 sentences) → Practical example → Why it matters |
| Behavioral / Personal | STAR method: Situation → Task → Action → Result. Draws from resume if available. |
| Coding / Algorithm | Approach → Clean code with comments → Time/space complexity → Edge cases |
| System Design | Requirements → Architecture → Data flow → Trade-offs |
| Greetings / Small Talk | Warm, natural, conversational 1–2 sentence response |

**Context resolution:** When the interviewer uses pronouns like "it", "that", "this", or "the previous one", the AI resolves them to the most recent topic from conversation history. It never asks for clarification.

**Conversation memory:** The last 20 messages (10 Q&A pairs) are included in each API call, giving the LLM full context of the interview flow. History is persisted via `GM_setValue` and survives page refreshes.

**Style constraints:** First-person voice, bold key terms, bullet points (3–5), 120–200 word target. The AI never says "I don't know" and never reveals it is an AI.

---

## Code Structure

```
script.js (~530 lines)
│
├─ CONFIG ─────────────── API key, model, role, company, finalize delay
├─ STATE ──────────────── Observer refs, caption tracking, conversation history
│
├─ Section 1: Caption Scraping
│   ├─ enableCaptions()        Auto-click the caption toggle button
│   ├─ isInCaptionContainer()  Check if element is inside a known caption container
│   ├─ scanForCaptions()       Fallback polling of all caption selectors (every 3s)
│   ├─ startObserver()         MutationObserver on document.body + CSS injection
│   ├─ trackElement()          Position/container filter + change-count tracking
│   ├─ extractNewText()        3-strategy dedup: prefix → suffix → length-diff
│   ├─ handleCaption()         Interim display + 1500ms finalize timer
│   ├─ finalizeCaption()       Clean transcript → update sliding window → send to AI
│   └─ stopObserver()          Disconnect observers, clear intervals, remove CSS
│
├─ Section 2: System Prompt
│   └─ buildSystemPrompt()     Multi-framework interview prompt with resume injection
│
├─ Section 3: Groq LLM
│   └─ sendToAI()              Rate-limited API call via GM_xmlhttpRequest, 2x retry, context enrichment
│
├─ Section 4: Helpers
│   ├─ safeHTML()              Trusted Types-safe innerHTML assignment
│   ├─ renderMd()              Lightweight Markdown to HTML (bold, code, lists, line breaks)
│   ├─ showLoading()           Animated loading indicator
│   └─ el()                    DOM element factory with inline styles
│
└─ Section 5: UI
    ├─ initUI()                Panel construction, font loading, CSS animations, event binding
    ├─ Drag system             mousedown / mousemove / mouseup on header
    ├─ Resume modal            Paste and persist resume text via GM_setValue
    ├─ Toggle / Regenerate     Start/Pause listener + regenerate last question
    ├─ Text input              Manual question submission with Enter key support
    ├─ Keyboard shortcuts      Alt+P (toggle), Alt+C (clear history)
    └─ boot()                  DOM-ready initialization with retry polling
```

---

## Version History

### v10.1 — Long-Interview Durability (Current)

Caption detection hardened for unlimited interview duration. Fixed critical bugs that caused detection to die after 2–3 minutes.

| Change | Details |
|--------|---------|
| Text Extraction | 3-strategy pipeline: prefix → suffix/tail → length-diff. Immune to STT retroactive corrections. |
| Sliding Window | `lastFinalizedText` capped to 1000-character tail (~200 words). `lastFinalizedLength` tracks full length as integer. |
| Finalize Order | Cursor only advances after confirming text will be used. Prevents short phrases from blocking detection. |
| Min Length | Lowered from 5 to 3 characters. Short phrases like "okay" are no longer silently dropped. |
| Memory Management | `textHistory` Map pruned every 15 seconds. Stale DOM references garbage collected. |
| Fallback Scanning | Caption containers polled every 3 seconds via `scanForCaptions()`. |
| Persistence | `convHistory` saved to `GM_setValue`, restored on page reload. |
| History Depth | Increased from 10 to 20 messages (10 Q&A pairs). |
| Caption Selectors | 12+ selectors covering multiple Meet DOM versions plus `aria-live` region detection. |
| Inactivity Reset | `lastFinalizedText` auto-resets after 30 seconds of silence. |
| Logging | `[IE]` prefixed console logs for DevTools debugging. |

### v10.0 — Caption Scraping Architecture

Complete architecture pivot. Replaced the entire audio capture pipeline with Google Meet's native caption DOM scraping.

| Change | Details |
|--------|---------|
| Transcription | Caption DOM scraping via `MutationObserver`. Zero latency, zero cost. |
| AI Engine | Groq LLaMA 3.3 70B with structured interview prompt. |
| Sentence Detection | Change-count tracking. Only elements with 2+ text changes are captured. |
| Deduplication | Tracks finalized prefix. Only the new text portion is sent to AI. |
| UI | Glassmorphic panel with glow animation, status dots, Inter font. |
| Captions | Auto-enabled. Native bar hidden with `opacity: 0`. |
| Greetings | AI responds to all speech types including small talk. |

### v8.0 — WebRTC + Whisper API + VAD

Audio-based approach. Intercepted remote audio via WebRTC `RTCPeerConnection` patching, recorded speech segments using a custom VAD engine, and transcribed via Groq Whisper API.

| Component | Technology |
|-----------|------------|
| Audio Capture | WebRTC `ontrack` hook → `AudioContext` → `MediaStreamDestination` mixer |
| Voice Detection | Custom VAD state machine (IDLE → RECORDING → SILENCE → send) |
| Transcription | Groq Whisper `whisper-large-v3-turbo` API (batch upload) |
| Noise Rejection | Adaptive noise floor + speech confirmation (3 consecutive frames) |

**Why replaced:** Audio capture required complex WebRTC hooking, MediaRecorder management, and per-request API costs. Caption scraping achieves the same result with zero latency and zero cost.

### v2.0 — Web Speech API + AI

Original approach. Used Chrome's `webkitSpeechRecognition` for speech-to-text with the AI answer pipeline.

| Component | Technology |
|-----------|------------|
| Transcription | `webkitSpeechRecognition` (browser-native) |
| AI Engine | Groq LLaMA 3.3 70B |
| STT Corrections | 20+ term mappings (`sequel` → SQL, `pie torch` → PyTorch) |
| Filler Removal | Regex-based (`um`, `uh`, `like`, `you know`) |

**Why replaced:** `webkitSpeechRecognition` only captures the local microphone. It cannot access remote participant audio from WebRTC streams, so it could only transcribe the user's own voice — not the interviewer's questions.

---

## Limitations

| Constraint | Details |
|------------|---------|
| Platform | Google Meet only. Zoom, Teams, and other platforms are not supported. |
| Browser | Chrome-based browsers recommended. Tampermonkey and the Meet DOM structure are Chrome-optimized. |
| Language | English only. Depends on Google Meet's caption language setting. |
| Captions | Requires Google Meet's caption feature to be available and enabled on your account. |
| AI Model | Requires a valid Groq API key. The free tier has rate limits (~30 requests/min). |
| Resume | Plain text only, capped at 3000 characters. |

---

## Security

**Do not commit your API key to a public repository.**

- The published `script.js` contains a placeholder (`YOUR_GROQ_API_KEY_HERE`). Replace it locally after installing.
- The `.gitignore` is configured to exclude development files containing real keys.
- All API communication uses HTTPS via `GM_xmlhttpRequest`.
- No data is sent to any server other than `api.groq.com`.

---

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m "feat: description"`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

Test your changes on a live Google Meet call before submitting. Do not break existing caption detection logic.

---

## Disclaimer

This project is built for **educational and personal practice purposes only**. It is a technical demonstration of DOM scraping, userscript development, and LLM API integration. The author assumes no responsibility for how it is used. Use responsibly and respect the policies of any platform you interact with.

---

*From WebRTC hooks to caption scraping — every iteration got faster, leaner, and more resilient.*
