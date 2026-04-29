# 🦅 InterviEagle AI — v2.0

**A real-time AI interview copilot that runs as a Tampermonkey overlay on Google Meet.** It intercepts the interviewer's speech via the Web Speech API, pipes it through Groq's LLaMA 3.3 70B model, and renders structured, interview-ready answers in a glassmorphic panel — typically in under 2 seconds end-to-end.

![JavaScript](https://img.shields.io/badge/JavaScript-ES6-F7DF1E?logo=javascript&logoColor=black)
![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Userscript-00485B?logo=tampermonkey&logoColor=white)
![Groq](https://img.shields.io/badge/Groq_API-LLM_Inference-F55036?logo=groq&logoColor=white)
![LLaMA](https://img.shields.io/badge/LLaMA_3.3-70B_Versatile-7B68EE?logo=meta&logoColor=white)
![Web Speech API](https://img.shields.io/badge/Web_Speech_API-STT-4285F4?logo=googlechrome&logoColor=white)
![Google Meet](https://img.shields.io/badge/Google_Meet-Overlay-00897B?logo=googlemeet&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Architecture Overview

```
Interviewer speaks → Web Speech API (STT) → Transcript cleanup (filler removal + STT corrections)
    → Groq API (LLaMA 3.3 70B) → Markdown-rendered answer → Glassmorphic overlay on Meet
```

The script injects a fixed-position overlay into the Google Meet DOM, maintains a rolling conversation history (5 turns), and uses a structured system prompt with distinct answer frameworks for technical, behavioral, coding, and system design questions.

---

## ✨ Features

- 🎤 **Live Speech Recognition** — continuous capture via Web Speech API with automatic restart and interim result display
- 🧠 **Structured AI Responses** — category-aware prompting (technical / behavioral / coding / system design) via Groq LLaMA 3.3 70B
- 📄 **Resume-Aware Context** — paste your resume text; the AI weaves your real projects, skills, and experience into answers
- ⌨️ **Manual Fallback** — type questions directly when speech detection misses something
- 🖱️ **Draggable Panel** — grab-and-move the overlay to any position on screen
- 📋 **One-Click Copy** — hover to reveal, click to copy the answer to clipboard with visual feedback
- 🔁 **Regenerate** — re-run the last question through the LLM with a single click
- 🔒 **Stealth Controls** — `Alt+P` toggles visibility (with CSS fade), `Alt+C` wipes conversation history
- 🔄 **Auto-Retry** — failed API calls retry up to 2× with exponential backoff
- 🛡️ **Rate Limiting** — 2-second cooldown prevents accidental API spam from rapid speech bursts

---

## 🚀 Setup

```bash
# 1. Install Tampermonkey extension in Chrome
# 2. Create a new userscript → paste TamperScript.js
# 3. Update the CONFIG section:
```

```javascript
var GROQ_API_KEY = 'your_groq_api_key';     // Get free at https://console.groq.com
var ROLE         = 'AI/ML Junior Developer'; // Your target role
var COMPANY      = 'Google';                 // Target company
```

```bash
# 4. Open any Google Meet call → overlay loads automatically
# 5. (Optional) Click "Resume" to paste your resume for personalized answers
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

## 📝 Changelog — v2.0

### 🧠 AI Answer Quality
- **Structured answer framework** — distinct strategies for technical, behavioral, coding, and system design questions
- **Temperature: 0.6 → 0.4** — reduced randomness for more precise, reliable outputs
- **Max tokens: 250 → 500** — answers are no longer truncated mid-sentence
- **Added `top_p: 0.9`** — nucleus sampling for higher-quality token selection
- **Conversation window: 3 → 5 turns** — maintains context across longer interview flows
- **Resume cap: 1500 → 3000 chars** — preserves more detail for personalized responses
- **Anti-hallucination guardrails** — explicit instructions to never break character or admit ignorance
- **Natural phrasing patterns** — responses open with interview-appropriate phrases, not chatbot-style output

### 🎨 UX & Polish
- **Animated loading state** — pulsing dot animation (`⬤⬤⬤ Thinking...`) replaces static ellipsis
- **CSS transitions** — smooth fade in/out on panel toggle instead of abrupt `display:none`
- **Draggable panel** — mousedown on header enables free repositioning
- **Copy button** — appears on hover over answer area; shows "Copied!" confirmation with color shift
- **Auto-scroll** — answer pane scrolls to top on each new response
- **Enhanced markdown** — now renders fenced code blocks (```) and numbered lists

### 🎤 Speech Recognition
- **STT auto-correction** — maps 20+ common transcription errors (sequel → SQL, pie torch → PyTorch, etc.)
- **Filler word stripping** — removes "um", "uh", "like", "you know" before LLM processing
- **Minimum threshold: 5 → 10 chars** — prevents sending incomplete speech fragments
- **Silence buffer: 1500 → 2000ms** — accommodates slower speakers and natural pauses
- **Restart gap: 300 → 100ms** — minimizes missed words between recognition cycles

### 🛡️ Robustness
- **Rate limiting** — enforces 2-second cooldown between consecutive API calls
- **Auto-retry with backoff** — retries failed requests up to 2× with progressive delay (1s, 2s / 1.5s, 3s)

---

## ⚠️ Disclaimer

This project is built for **educational and personal practice purposes**. The author takes no responsibility for how it is used. Please exercise good judgment.

---

**Engineered with precision 🛠️**
