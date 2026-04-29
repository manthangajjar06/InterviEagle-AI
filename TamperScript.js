// ==UserScript==
// @name         🦅 InterviEagle AI
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  AI-powered interview answer assistant for Google Meet — get real-time answers as the candidate
// @match        https://meet.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      api.groq.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ─── CONFIG (Edit these before using) ────────────────────────────────────
    var GROQ_API_KEY = 'YOUR API KEY';          // 🔑 Paste your Groq API key here (get it free at https://console.groq.com)
    var LLM_MODEL = 'llama-3.3-70b-versatile';   // ✅ Recommended model — fast & free on Groq
    var ROLE = 'YOUR_ROLE';          // 🧑‍💼 Your target job role
    var COMPANY = 'COMPANY';                // 🏢 Target company name (or leave as default)
    var SILENCE_MS = 1500;                         // ⏱️ Silence duration (ms) before sending detected speech to AI
    // ─────────────────────────────────────────────────────────────────────────

    var resumeText = GM_getValue('resume_text', '');
    if (resumeText.length > 3000) resumeText = resumeText.substring(0, 3000) + '...';

    // ─── Common STT corrections ───────────────────────────────────────────────
    var STT_FIXES = {
        'sequel': 'SQL', 'my sequel': 'MySQL', 'post gress': 'Postgres',
        'no js': 'Node.js', 'react js': 'React.js', 'next js': 'Next.js',
        'mongo db': 'MongoDB', 'fire base': 'Firebase', 'type script': 'TypeScript',
        'java script': 'JavaScript', 'web socket': 'WebSocket', 'redis': 'Redis',
        'oop': 'OOP', 'api': 'API', 'rest api': 'REST API', 'graphql': 'GraphQL',
        'ci cd': 'CI/CD', 'dev ops': 'DevOps', 'kubernetes': 'Kubernetes',
        'docker': 'Docker', 'aws': 'AWS', 'azure': 'Azure',
        'tensor flow': 'TensorFlow', 'pie torch': 'PyTorch', 'numpy': 'NumPy',
        'pandas': 'Pandas', 'scikit learn': 'scikit-learn'
    };
    var FILLER_RE = /\b(um+|uh+|ah+|like|you know|i mean|basically|actually|so+|well)\b/gi;

    function cleanTranscript(text) {
        var cleaned = text.replace(FILLER_RE, ' ').replace(/\s{2,}/g, ' ').trim();
        var lower = cleaned.toLowerCase();
        for (var key in STT_FIXES) {
            if (lower.indexOf(key) !== -1) {
                cleaned = cleaned.replace(new RegExp(key, 'gi'), STT_FIXES[key]);
            }
        }
        return cleaned;
    }

    function buildSystemPrompt() {
        var r = resumeText
            ? '\n\n=== CANDIDATE RESUME ===\n' + resumeText + '\n=== END RESUME ==='
            : '';
        var p = 'You ARE the candidate in a live job interview for the role of ' + ROLE + ' at ' + COMPANY + '.';
        p += ' The interviewer\'s question comes from speech-to-text (may contain transcription errors — interpret intelligently).';
        p += ' Write exactly what YOU would say out loud as the candidate.' + r;
        p += '\n\n## CONTEXT RESOLUTION';
        p += '\nWhen the interviewer says "it", "that", "this", "the previous one", "what about" — ALWAYS resolve to the most recent topic from conversation history. Never ask for clarification.';
        p += '\n\n## RULES';
        p += '\n1. Small talk, greetings, or audio checks ("can you hear me", "hello", "am I audible", "how are you") → respond ONLY with: [NOT A QUESTION]';
        p += '\n2. For ALL other questions, answer as the candidate:';
        p += '\n\n## ANSWER FRAMEWORK';
        p += '\n\n### For TECHNICAL/CONCEPTUAL questions (what is X, explain Y, how does Z work, difference between A and B):';
        p += '\n1. **One-line definition** — crisp, precise, no filler';
        p += '\n2. **How it works** — explain the mechanism/internals in 2-3 sentences like a senior engineer';
        p += '\n3. **Practical example** — tie to real-world usage or your own project experience';
        p += '\n4. **Why it matters** — one sentence on when/why you\'d choose this approach';
        p += '\nFor comparison questions (X vs Y): use a structured format — define both briefly, then contrast on 3-4 key dimensions.';
        p += '\n\n### For BEHAVIORAL/PERSONAL questions (tell me about yourself, your experience, challenges, teamwork):';
        if (resumeText) {
            p += '\n- Draw DIRECTLY from the resume. Reference specific projects, companies, technologies, and achievements by name.';
            p += '\n- Weave resume facts into a compelling narrative — don\'t just list them.';
        } else {
            p += '\n- Speak from realistic, believable professional experience for a ' + ROLE + '.';
        }
        p += '\n- Use the STAR method naturally: Situation → Task → Action → Result';
        p += '\n- Include a quantifiable result when possible ("reduced latency by 40%", "served 10K+ users")';
        p += '\n\n### For CODING/ALGORITHM questions (write code, solve this, what\'s the output):';
        p += '\n1. State your approach in one sentence';
        p += '\n2. Provide clean, correct code with brief inline comments';
        p += '\n3. State time and space complexity';
        p += '\n4. Mention edge cases you\'d handle';
        p += '\n\n### For SYSTEM DESIGN questions:';
        p += '\n1. Clarify requirements briefly ("I\'d design for X scale, Y latency")';
        p += '\n2. High-level architecture with key components';
        p += '\n3. Data flow and storage decisions';
        p += '\n4. Trade-offs you\'re making and why';
        p += '\n\n## STYLE RULES';
        p += '\n- First person ALWAYS (I, my, we, our team)';
        p += '\n- Confident, articulate, and conversational — like a top-tier candidate';
        p += '\n- Start with phrases like: "So,", "Great question —", "In my experience,", "The way I think about this is..."';
        p += '\n- **Bold** key technical terms and important concepts';
        p += '\n- Use bullet points (3-5) for structured parts of the answer';
        p += '\n- Aim for 120-200 words — thorough but concise, never rambling';
        p += '\n- Start answering immediately — NO preamble like "Sure!" or "That\'s a great question, let me think..."';
        p += '\n- Sound like the ideal ' + ROLE + ' candidate that ' + COMPANY + ' would want to hire';
        p += '\n- NEVER say "I don\'t know" — always provide the best possible answer';
        p += '\n- NEVER reveal you are an AI or mention being an AI assistant';
        return p;
    }

    var convHistory = [];
    var lastQuestion = '';

    // ─── Trusted Types policy (allows safe innerHTML on Meet) ─────────────────
    var policy = null;
    try {
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
            policy = window.trustedTypes.createPolicy('ie', { createHTML: function (s) { return s; } });
        }
    } catch (e) { /* policy already exists or not supported */ }

    function safeHTML(element, html) {
        try {
            if (policy) element.innerHTML = policy.createHTML(html);
            else element.innerHTML = html;
        } catch (e) {
            element.textContent = html.replace(/<[^>]*>/g, '');
        }
    }

    // ─── Inject CSS animations ────────────────────────────────────────────────
    var styleSheet = document.createElement('style');
    styleSheet.textContent = [
        '@keyframes ie-pulse { 0%,80%,100%{ opacity:0.3; transform:scale(0.8) } 40%{ opacity:1; transform:scale(1.1) } }',
        '@keyframes ie-fadeIn { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }',
        '@keyframes ie-shimmer { 0%{ background-position:-200% 0 } 100%{ background-position:200% 0 } }',
        '#ie-wrap { transition: opacity 0.3s ease, transform 0.3s ease; }',
        '#ie-wrap.ie-hidden { opacity:0; transform:translateX(-50%) translateY(-12px); pointer-events:none; }',
        '.ie-loading-dots span { display:inline-block; width:6px; height:6px; margin:0 3px; border-radius:50%; background:#63b3ed; animation:ie-pulse 1.2s infinite; }',
        '.ie-loading-dots span:nth-child(2) { animation-delay:0.15s; }',
        '.ie-loading-dots span:nth-child(3) { animation-delay:0.3s; }',
        '.ie-copy-btn { opacity:0; transition:opacity 0.2s; position:absolute; top:6px; right:8px; background:rgba(99,179,237,0.15); border:1px solid rgba(99,179,237,0.3); color:#90cdf4; border-radius:5px; font-size:10px; padding:2px 8px; cursor:pointer; }',
        '.ie-ans-wrap:hover .ie-copy-btn { opacity:1; }',
        '.ie-copy-btn.ie-copied { background:rgba(52,211,153,0.2); border-color:rgba(52,211,153,0.4); color:#6ee7b7; }',
    ].join('\n');
    document.head.appendChild(styleSheet);

    // ─── Markdown renderer ────────────────────────────────────────────────────
    function renderMd(text) {
        return text
            .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(255,255,255,0.06);padding:8px 12px;border-radius:6px;font-size:11px;overflow-x:auto;margin:4px 0"><code>$1</code></pre>')
            .replace(/\*\*(.*?)\*\*/g, '<b style="color:#93c5fd">$1</b>')
            .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;font-size:12px">$1</code>')
            .replace(/^(\d+)\.\s(.+)/gm, '<li style="margin:2px 0;margin-left:16px;list-style:decimal">$2</li>')
            .replace(/^[-\u2022]\s(.+)/gm, '<li style="margin:2px 0;margin-left:16px;list-style:disc">$1</li>')
            .replace(/\n/g, '<br>');
    }

    function showLoading() {
        safeHTML(ansEl, '<div class="ie-loading-dots" style="padding:8px 0"><span></span><span></span><span></span><span style="margin-left:8px;color:#64748b;font-size:11px;vertical-align:middle">Thinking...</span></div>');
    }

    // ─── DOM helper ───────────────────────────────────────────────────────────
    function el(tag, s, txt, kids) {
        var e = document.createElement(tag);
        if (s) Object.assign(e.style, s);
        if (txt) e.textContent = txt;
        if (kids) kids.forEach(function (c) { if (c) e.appendChild(c); });
        return e;
    }

    // ─── Build overlay ────────────────────────────────────────────────────────
    var S = {
        wrap: {
            position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)',
            width: '560px', background: 'rgba(6,10,24,0.94)', backdropFilter: 'blur(16px)',
            border: '1px solid rgba(99,179,237,0.4)', borderRadius: '14px',
            zIndex: '2147483647', fontFamily: 'Inter,system-ui,sans-serif',
            color: '#f1f5f9', boxShadow: '0 12px 48px rgba(0,0,0,0.7)', overflow: 'hidden'
        },
        head: {
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
            background: 'rgba(99,179,237,0.1)', borderBottom: '1px solid rgba(99,179,237,0.15)',
            cursor: 'grab', userSelect: 'none'
        },
        logo: { fontSize: '14px', fontWeight: '700', color: '#90cdf4' },
        badge: {
            fontSize: '10px', fontWeight: '500', color: '#63b3ed',
            padding: '2px 8px', background: 'rgba(99,179,237,0.1)',
            border: '1px solid rgba(99,179,237,0.2)', borderRadius: '10px'
        },
        stat: { fontSize: '11px', color: '#64748b', marginLeft: 'auto' },
        btn: {
            background: 'rgba(99,179,237,0.15)', border: '1px solid rgba(99,179,237,0.3)',
            color: '#90cdf4', borderRadius: '6px', fontSize: '11px', padding: '3px 10px', cursor: 'pointer'
        },
        xBtn: { background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '18px', lineHeight: '1' },
        q: {
            padding: '5px 14px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis',
            borderBottom: '1px solid rgba(255,255,255,0.04)', minHeight: '24px'
        },
        ans: {
            padding: '10px 14px', fontSize: '13px', lineHeight: '1.65', color: '#e2e8f0',
            maxHeight: '200px', overflowY: 'auto'
        },
        foot: { padding: '4px 14px', fontSize: '10px', color: '#334155', display: 'flex', gap: '12px' },
        typeRow: {
            display: 'flex', gap: '6px', padding: '8px 14px',
            borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)'
        },
        typeInput: {
            flex: '1', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', padding: '6px 12px', fontSize: '12px', color: '#f1f5f9',
            fontFamily: 'Inter,system-ui,sans-serif', outline: 'none'
        },
        sendBtn: {
            background: 'rgba(99,179,237,0.2)', border: '1px solid rgba(99,179,237,0.35)',
            color: '#90cdf4', borderRadius: '8px', fontSize: '12px',
            padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap'
        }
    };

    var statEl = el('span', S.stat, 'Click Start');
    var toggleBtn = el('button', S.btn, 'Start');
    var regenBtn = el('button', S.btn, 'Regen');
    var closeBtn = el('button', S.xBtn, 'x');
    var typeInput = el('input', S.typeInput);
    typeInput.placeholder = 'Type a question and press Enter...';
    typeInput.type = 'text';
    var sendBtnEl = el('button', S.sendBtn, 'Ask');
    var typeRow = el('div', S.typeRow, null, [typeInput, sendBtnEl]);

    var qEl = el('div', S.q, 'Speech will appear here...');
    var ansEl = el('div', S.ans, 'Click Start to use voice, or type below.');
    var copyBtn = el('button', null, 'Copy');
    copyBtn.className = 'ie-copy-btn';
    copyBtn.onclick = function () {
        var text = ansEl.innerText || ansEl.textContent;
        navigator.clipboard.writeText(text).then(function () {
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('ie-copied');
            setTimeout(function () { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('ie-copied'); }, 1500);
        });
    };
    var ansWrap = el('div', { position: 'relative' });
    ansWrap.className = 'ie-ans-wrap';
    ansWrap.appendChild(ansEl);
    ansWrap.appendChild(copyBtn);
    var foot = el('div', S.foot, null, [
        el('span', null, 'Alt+P: toggle'), el('span', null, 'Alt+C: clear')
    ]);
    var resumeBtn = el('button', S.btn, resumeText ? 'Resume ✓' : 'Resume');
    var head = el('div', S.head, null, [
        el('span', S.logo, '🦅 InterviEagle AI'),
        el('span', S.badge, ROLE + ' @ ' + COMPANY),
        statEl, toggleBtn, regenBtn, resumeBtn, closeBtn
    ]);

    // ─── Resume modal ─────────────────────────────────────────────────────────
    var modal = el('div', {
        display: 'none', position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.7)',
        zIndex: '2147483648', alignItems: 'center', justifyContent: 'center'
    });
    var modalBox = el('div', {
        background: '#0f172a', border: '1px solid rgba(99,179,237,0.4)', borderRadius: '12px',
        padding: '20px', width: '500px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '10px'
    });
    var modalTitle = el('div', { fontSize: '13px', fontWeight: '600', color: '#90cdf4' }, 'Paste your resume text');
    var modalHint = el('div', { fontSize: '11px', color: '#475569' }, 'Copy all text from your resume PDF and paste it here. AI will use your real experience for personal questions.');
    var modalTA = el('textarea', {
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px', padding: '10px', fontSize: '11px', color: '#e2e8f0',
        fontFamily: 'Inter,system-ui,sans-serif', resize: 'vertical', height: '200px',
        width: '100%', outline: 'none', boxSizing: 'border-box'
    });
    modalTA.value = resumeText;
    modalTA.placeholder = 'Paste resume text here...';
    modalTA.addEventListener('keydown', function (e) { e.stopPropagation(); });
    modalTA.addEventListener('keyup', function (e) { e.stopPropagation(); });
    var modalRow = el('div', { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
    var modalSave = el('button', S.sendBtn, 'Save Resume');
    var modalClear = el('button', Object.assign({}, S.btn, { color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }), 'Clear');
    var modalCloseBtn = el('button', S.btn, 'Cancel');
    modalRow.appendChild(modalClear);
    modalRow.appendChild(modalCloseBtn);
    modalRow.appendChild(modalSave);
    modalBox.appendChild(modalTitle);
    modalBox.appendChild(modalHint);
    modalBox.appendChild(modalTA);
    modalBox.appendChild(modalRow);
    modal.appendChild(modalBox);
    document.body.appendChild(modal);

    resumeBtn.onclick = function () { modal.style.display = 'flex'; modalTA.focus(); };
    modalCloseBtn.onclick = function () { modal.style.display = 'none'; };
    modalClear.onclick = function () {
        resumeText = ''; GM_setValue('resume_text', '');
        modalTA.value = ''; resumeBtn.textContent = 'Resume';
        modal.style.display = 'none';
    };
    modalSave.onclick = function () {
        resumeText = modalTA.value.trim();
        GM_setValue('resume_text', resumeText);
        resumeBtn.textContent = resumeText ? 'Resume ✓' : 'Resume';
        modal.style.display = 'none';
        statEl.textContent = resumeText ? 'Resume saved!' : 'Resume cleared';
        setTimeout(function () { statEl.textContent = listening ? 'Listening...' : 'Paused'; }, 2000);
    };

    var wrap = el('div', null, null, [head, qEl, ansWrap, typeRow, foot]);
    Object.assign(wrap.style, S.wrap);
    wrap.id = 'ie-wrap';
    document.body.appendChild(wrap);

    // ─── Draggable panel ──────────────────────────────────────────────────────
    var dragState = { dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 };
    head.addEventListener('mousedown', function (e) {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
        dragState.dragging = true;
        dragState.startX = e.clientX;
        dragState.startY = e.clientY;
        var rect = wrap.getBoundingClientRect();
        dragState.origX = rect.left;
        dragState.origY = rect.top;
        wrap.style.transform = 'none';
        wrap.style.left = rect.left + 'px';
        wrap.style.top = rect.top + 'px';
        head.style.cursor = 'grabbing';
        e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
        if (!dragState.dragging) return;
        var dx = e.clientX - dragState.startX;
        var dy = e.clientY - dragState.startY;
        wrap.style.left = (dragState.origX + dx) + 'px';
        wrap.style.top = (dragState.origY + dy) + 'px';
    });
    document.addEventListener('mouseup', function () {
        if (dragState.dragging) {
            dragState.dragging = false;
            head.style.cursor = 'grab';
        }
    });

    // ─── Text input send logic ────────────────────────────────────────────────
    function submitTyped() {
        var q = typeInput.value.trim();
        if (!q) return;
        qEl.textContent = 'Typed: "' + q + '"';
        typeInput.value = '';
        sendToAI(q);
    }
    sendBtnEl.onclick = submitTyped;
    typeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitTyped(); }
        e.stopPropagation();
    });
    typeInput.addEventListener('keyup', function (e) { e.stopPropagation(); });
    typeInput.addEventListener('keypress', function (e) { e.stopPropagation(); });

    closeBtn.onclick = function () { wrap.classList.add('ie-hidden'); };
    document.addEventListener('keydown', function (e) {
        if (e.altKey && e.key === 'p') wrap.classList.toggle('ie-hidden');
        if (e.altKey && e.key === 'c') { qEl.textContent = ''; ansEl.textContent = 'Cleared.'; convHistory = []; }
    });
    new MutationObserver(function () {
        if (!document.getElementById('ie-wrap')) document.body.appendChild(wrap);
    }).observe(document.body, { childList: true });

    // ─── Speech Recognition ───────────────────────────────────────────────────
    var listening = false;
    var recognition = null;
    var transcript = '';
    var silTimer = null;

    function setupSpeech() {
        var SR = unsafeWindow.SpeechRecognition || unsafeWindow.webkitSpeechRecognition;
        if (!SR) { statEl.textContent = 'No SpeechRecognition'; return false; }

        recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = function () {
            statEl.textContent = 'Listening...';
            console.log('[InterviEagle] Recognition started');
        };

        recognition.onerror = function (e) {
            console.log('[InterviEagle] Error:', e.error);
            if (e.error === 'not-allowed') {
                statEl.textContent = 'Mic blocked';
                listening = false; toggleBtn.textContent = 'Start';
            } else if (e.error === 'network') {
                statEl.textContent = 'Network error — use Chrome';
                listening = false; toggleBtn.textContent = 'Start';
            } else if (e.error !== 'no-speech') {
                statEl.textContent = 'Error: ' + e.error;
            }
        };

        recognition.onend = function () {
            console.log('[InterviEagle] Recognition ended, listening:', listening);
            if (listening) {
                setTimeout(function () {
                    if (listening) { try { recognition.start(); } catch (e) { } }
                }, 100);
            }
        };

        recognition.onresult = function (event) {
            var interim = '';
            for (var i = event.resultIndex; i < event.results.length; i++) {
                var text = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    transcript += (transcript ? ' ' : '') + text.trim();
                    console.log('[InterviEagle] Final:', text.trim());

                    clearTimeout(silTimer);
                    silTimer = setTimeout(function () {
                        var cleaned = cleanTranscript(transcript);
                        if (cleaned.length > 10) {
                            transcript = '';
                            qEl.textContent = 'Q: "' + cleaned + '"';
                            sendToAI(cleaned);
                        }
                    }, SILENCE_MS);
                } else {
                    interim += text;
                }
            }
            if (interim) qEl.textContent = '...' + interim;
        };

        return true;
    }

    function toggleListen() {
        if (!recognition && !setupSpeech()) return;
        listening = !listening;
        toggleBtn.textContent = listening ? 'Pause' : 'Resume';
        if (listening) {
            transcript = '';
            try { recognition.start(); } catch (e) { console.log('[InterviEagle] Start error:', e); }
        } else {
            clearTimeout(silTimer);
            try { recognition.stop(); } catch (e) { }
            statEl.textContent = 'Paused';
        }
    }

    toggleBtn.onclick = toggleListen;
    regenBtn.onclick = function () { if (lastQuestion) sendToAI(lastQuestion); };

    // ─── Groq LLM ─────────────────────────────────────────────────────────────
    var lastApiCall = 0;
    var RATE_LIMIT_MS = 2000;

    function sendToAI(question, retryCount) {
        retryCount = retryCount || 0;

        if (!GROQ_API_KEY) {
            safeHTML(ansEl, '<span style="color:#fca5a5">⚠️ No API key set. Open the script and paste your Groq API key in the CONFIG section.</span>');
            statEl.textContent = 'No API key';
            return;
        }

        // Rate limiting — prevent API spam
        var now = Date.now();
        var timeSinceLast = now - lastApiCall;
        if (timeSinceLast < RATE_LIMIT_MS && retryCount === 0) {
            setTimeout(function () { sendToAI(question, retryCount); }, RATE_LIMIT_MS - timeSinceLast);
            statEl.textContent = 'Queued...';
            return;
        }
        lastApiCall = Date.now();

        var enrichedQuestion = question;
        if (lastQuestion && lastQuestion !== question) {
            enrichedQuestion = '[Previous topic: "' + lastQuestion + '"] New question: ' + question;
        }
        lastQuestion = question;
        statEl.textContent = 'Generating...';
        showLoading();

        var messages = [{ role: 'system', content: buildSystemPrompt() }];
        for (var i = 0; i < convHistory.length; i++) messages.push(convHistory[i]);
        messages.push({ role: 'user', content: enrichedQuestion });

        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://api.groq.com/openai/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + GROQ_API_KEY
            },
            data: JSON.stringify({
                model: LLM_MODEL,
                messages: messages,
                temperature: 0.4,
                max_tokens: 500,
                top_p: 0.9
            }),
            onload: function (res) {
                try {
                    var d = JSON.parse(res.responseText);
                    var ans = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
                    if (ans) {
                        if (ans.indexOf('[NOT A QUESTION]') !== -1) {
                            ansEl.textContent = 'Not an interview question — waiting...';
                            statEl.textContent = listening ? 'Listening...' : 'Ready';
                            return;
                        }
                        safeHTML(ansEl, renderMd(ans));
                        ansEl.scrollTop = 0;
                        statEl.textContent = 'Ready';
                        convHistory.push({ role: 'user', content: question });
                        convHistory.push({ role: 'assistant', content: ans });
                        if (convHistory.length > 10) convHistory = convHistory.slice(-10);
                    } else {
                        statEl.textContent = 'Empty response';
                        console.error('[InterviEagle]', res.responseText);
                    }
                } catch (e) {
                    // Retry on parse error (up to 2 retries)
                    if (retryCount < 2) {
                        statEl.textContent = 'Retrying...';
                        setTimeout(function () { sendToAI(question, retryCount + 1); }, 1000 * (retryCount + 1));
                        return;
                    }
                    statEl.textContent = 'Parse error';
                    console.error('[InterviEagle]', res.responseText);
                }
            },
            onerror: function () {
                // Retry on network error (up to 2 retries)
                if (retryCount < 2) {
                    statEl.textContent = 'Retrying...';
                    setTimeout(function () { sendToAI(question, retryCount + 1); }, 1500 * (retryCount + 1));
                    return;
                }
                statEl.textContent = 'Network error';
            }
        });
    }

    console.log('[InterviEagle AI] v2.0 loaded — click Start to begin');
})();
