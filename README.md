# 🦅 InterviEagle AI — v10.1

**A zero-latency AI interview copilot that runs as a Tampermonkey overlay on Google Meet.** It silently scrapes Google Meet's native captions, pipes the interviewer's questions through Groq's LLaMA 3.3 70B model, and renders structured, interview-ready answers in a glassmorphic floating panel — with zero configuration and no API costs for transcription.

![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)
![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Userscript-00485B?logo=tampermonkey&logoColor=white)
![Groq](https://img.shields.io/badge/Groq_API-LLM_Inference-F55036?logo=groq&logoColor=white)
![LLaMA](https://img.shields.io/badge/LLaMA_3.3-70B_Versatile-7B68EE?logo=meta&logoColor=white)
![Google Meet](https://img.shields.io/badge/Google_Meet-Caption_Scraping-00897B?logo=googlemeet&logoColor=white)

---

## Architecture Overview

```
Interviewer speaks
    → Google Meet Captions (native, zero latency)
    → DOM MutationObserver scrapes caption text
    → Multi-strategy text extraction (prefix / suffix / length-diff)
    → Sentence deduplication & STT corrections
    → Groq API (LLaMA 3.3 70B, ~1.5s)
    → Markdown-rendered answer
    → Glassmorphic overlay on Meet
```

The script auto-enables Google Meet's built-in captions, hides the native caption bar, and observes DOM mutations to detect live caption text. A 3-strategy extraction pipeline handles Google Meet's accumulated caption text — including retroactive STT corrections — using prefix matching, tail/suffix anchoring, and length-based diffing. A 300-character sliding window keeps memory constant regardless of interview duration. Finalized sentences are cleaned, deduplicated, and sent to Groq's LLM with a structured interview-aware system prompt.

---

## ✨ Features

- 🎯 **Zero-Latency Transcription** — scrapes Google Meet's native captions via DOM observation (no audio processing, no STT API)
- 🧠 **Structured AI Responses** — category-aware prompting (technical / behavioral / coding / system design) via Groq LLaMA 3.3 70B
- 📄 **Resume-Aware Context** — paste your resume text; the AI weaves your real projects, skills, and experience into answers
- 🕐 **Unlimited Interview Duration** — sliding window dedup + periodic cleanup means the script never degrades, even in 3+ hour interviews
- 🔇 **Stealth Mode** — native caption bar is hidden; only the InterviEagle panel is visible
- ⌨️ **Manual Fallback** — type questions directly when captions miss something
- 🖱️ **Draggable Panel** — grab-and-move the overlay to any position on screen
- 📋 **One-Click Copy** — hover to reveal, click to copy the answer to clipboard
- 🔁 **Regenerate** — re-run the last question through the LLM
- 💾 **Persistent History** — conversation history survives page refreshes (stored via GM_setValue)
- 🔒 **Stealth Controls** — `Alt+P` toggles visibility, `Alt+C` wipes conversation history
- 🔄 **Auto-Retry** — failed API calls retry up to 2× with exponential backoff
- 🛡️ **Rate Limiting** — 2-second cooldown prevents API spam
- 🧹 **Self-Cleaning Memory** — stale DOM references pruned every 15s, fallback caption scan every 3s
- ✨ **Glow Animation** — panel softly pulses when actively listening
- 🟢 **Status Indicators** — live green dot when active, grey when paused

---

## 🚀 Setup

```bash
# 1. Install Tampermonkey extension in Chrome/Edge/Firefox
# 2. Create a new userscript → paste script.js
# 3. Update the CONFIG section:
```

```javascript
var GROQ_API_KEY = 'your_groq_api_key';     // Get free at https://console.groq.com
var ROLE         = 'AI/ML Junior Developer'; // Your target role
var COMPANY      = 'Google';                 // Target company
```

```bash
# 4. Open any Google Meet call → overlay loads automatically
# 5. Click "Start" → captions are auto-enabled and hidden
# 6. (Optional) Click "Resume" to paste your resume for personalized answers
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + P` | Toggle panel visibility (smooth fade) |
| `Alt + C` | Clear conversation history |
| `Enter` | Submit typed question |
| `Click + Drag` | Reposition panel (grab header) |

---

## 🔧 Caption Detection Engine (v10.1)

The core innovation is a **3-strategy text extraction pipeline** that handles Google Meet's caption accumulation pattern — where all spoken text is appended to a single growing DOM element:

### The Problem
Google Meet doesn't create new elements per sentence. Instead, it appends all caption text into one growing element. After ~2 minutes, this string exceeds 500+ characters and keeps growing. Previous versions broke because they either capped text length or relied on simple prefix matching that failed when Meet retroactively corrected earlier words.

### The Solution: Multi-Strategy Extraction

| Strategy | When It Fires | How It Works |
|----------|---------------|--------------|
| **1. Prefix Match** | Early interview (< 300 chars) | `fullText.startsWith(lastFinalizedText)` → slices off the known prefix |
| **2. Tail/Suffix Match** | STT corrected earlier words | Uses last 80 chars as anchor → `lastIndexOf()` finds it → extracts text after |
| **3. Length-Diff** | Both strategies fail | Compares `fullText.length` vs `lastFinalizedLength` → extracts the growth delta with sentence boundary detection |

### Durability Features

| Feature | Mechanism |
|---------|-----------|
| **Sliding Window** | `lastFinalizedText` stores only the last 300 chars — memory stays constant for any interview length |
| **Full Length Tracking** | `lastFinalizedLength` stores the true transcript length as an integer for accurate diff calculation |
| **30s Inactivity Reset** | If no captions for 30 seconds, the dedup state resets to prevent permanent blocking |
| **DOM Cleanup** | `textHistory` Map is pruned every 15s — detached elements are garbage collected |
| **Fallback Scan** | Known caption containers are polled every 3s — catches anything MutationObserver missed |
| **Caption Container Detection** | 12+ selectors covering multiple Meet DOM versions + `aria-live` region detection |

---

## 📐 Version History

### v10.1 — Long-Interview Durability (Current)
**Caption detection hardened for unlimited interview duration.** Fixed critical bugs that caused detection to die after 2-3 minutes.

| Component | Change |
|-----------|--------|
| **Text Length Cap** | Removed the 500-char cap that killed detection on accumulated captions |
| **Text Extraction** | 3-strategy pipeline: prefix → suffix/tail → length-diff (immune to STT corrections) |
| **Sliding Window** | `lastFinalizedText` capped to 300-char tail; `lastFinalizedLength` tracks full length |
| **Finalize Order** | `lastFinalizedText` cursor only advances AFTER confirming text will be used (prevents short phrases from blocking detection) |
| **Min Length** | Lowered from 5 to 3 chars — short phrases like "okay" no longer silently dropped |
| **Memory Management** | `textHistory` Map pruned every 15s; stale DOM references garbage collected |
| **Fallback Scanning** | Caption containers polled every 3s via `scanForCaptions()` |
| **Persistence** | `convHistory` saved to `GM_setValue`, restored on page reload |
| **History Depth** | Increased from 10 to 20 messages (10 Q&A pairs) |
| **Caption Selectors** | 12+ selectors for multiple Meet DOM versions + `aria-live` regions |
| **Inactivity Reset** | `lastFinalizedText` auto-resets after 30s silence to prevent permanent blocking |
| **Console Logging** | `[IE]` prefixed logs for DevTools debugging |

### v10.0 — Caption Scraping + AI
**Complete architecture pivot.** Replaced the entire audio capture pipeline with Google Meet's native caption scraping.

| Component | Change |
|-----------|--------|
| **Transcription** | Caption DOM scraping via `MutationObserver` (zero latency) |
| **AI Engine** | Groq LLaMA 3.3 70B with structured interview prompt |
| **Sentence Detection** | Change-count tracking — only elements with 2+ text changes are captured |
| **Deduplication** | Tracks finalized prefix; only new text portion is sent to AI |
| **UI** | Glassmorphic panel with glow animation, status dots, Inter font |
| **Captions** | Auto-enabled, native bar hidden with `opacity: 0` |
| **Greetings** | AI now responds to all speech including small talk (no `[NOT A QUESTION]`) |

### v8.0 — WebRTC + Whisper API + VAD
**Audio-based approach.** Intercepted remote audio via WebRTC `RTCPeerConnection` patching, recorded speech segments using a custom VAD (Voice Activity Detection) engine, and transcribed via Groq's Whisper API.

| Component | Technology |
|-----------|------------|
| **Audio Capture** | WebRTC `ontrack` hook → `AudioContext` → `MediaStreamDestination` mixer |
| **Voice Detection** | Custom VAD state machine (IDLE → RECORDING → SILENCE → send) |
| **Transcription** | Groq Whisper `whisper-large-v3-turbo` API (batch upload) |
| **Noise Rejection** | Adaptive noise floor + speech confirmation (3 consecutive frames) |
| **Latency** | ~1–1.5s after speaker pauses |

**Why replaced:** Audio capture required complex WebRTC hooking, MediaRecorder management, and API costs for transcription. Caption scraping achieves the same result with zero latency and zero cost.

### v2.0 — Web Speech API + AI
**Original approach.** Used Chrome's `webkitSpeechRecognition` for speech-to-text with the AI answer pipeline.

| Component | Technology |
|-----------|------------|
| **Transcription** | `webkitSpeechRecognition` (browser native) |
| **AI Engine** | Groq LLaMA 3.3 70B |
| **STT Corrections** | 20+ term mappings (sequel → SQL, pie torch → PyTorch) |
| **Filler Removal** | Regex-based (um, uh, like, you know) |

**Why replaced:** `webkitSpeechRecognition` only captures the local microphone — it cannot access remote participant audio from WebRTC streams. This meant it could only transcribe the user's own voice, not the interviewer's.

---

## 🧠 System Prompt Architecture

The AI operates with a multi-framework system prompt:

| Question Type | Framework |
|--------------|-----------|
| **Technical/Conceptual** | Definition → Mechanism → Example → Why it matters |
| **Behavioral/Personal** | STAR method (Situation → Task → Action → Result) |
| **Coding/Algorithm** | Approach → Code → Complexity → Edge cases |
| **System Design** | Requirements → Architecture → Data flow → Trade-offs |
| **Greetings/Small talk** | Warm, natural 1-2 sentence response |

The prompt enforces first-person voice, interview-appropriate phrasing, bold key terms, and 120-200 word target length. Resume text (if provided) is injected for personalized behavioral answers.

---

## 🗂️ Project Structure

```
intervieagle/
├── script.js        # Tampermonkey userscript (install this)
├── README.md        # This file
└── .gitignore       # Ignores API keys and dev files
```

---

## ⚠️ Security Notice

> **Never commit your API key to a public repository.**
> The `script.js` file contains a placeholder — replace it with your own Groq API key locally.

---

## ⚠️ Disclaimer

This project is built for **educational and personal practice purposes only**. It is a technical demonstration of DOM scraping, userscript development, and LLM integration. The author takes no responsibility for how it is used. Please exercise good judgment and respect the policies of any platform you use.

---

**Engineered with precision 🛠️ — from WebRTC hooks to caption scraping, every iteration got faster.**
