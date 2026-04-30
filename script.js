// ==UserScript==
// @name         🦅 InterviEagle AI v10
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  AI-powered interview assistant — scrapes Meet captions + generates answers via Groq LLM
// @match        https://meet.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.groq.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ─── CONFIG ────────────────────────────────────────────────────────────
    var GROQ_API_KEY = 'YOUR_GROQ_API_KEY_HERE';   // 🔑 Get free at https://console.groq.com
    var LLM_MODEL = 'llama-3.3-70b-versatile';
    var ROLE = 'AI/ML Junior Developer';
    var COMPANY = 'Google';
    var FINALIZE_DELAY = 1500;

    // ─── STATE ─────────────────────────────────────────────────────────────
    var isActive = false;
    var observer = null;
    var lastFinalizedText = '';
    var lastFinalizedLength = 0;
    var lastFinalizedTime = 0;
    var finalizeTimer = null;
    var currentCaptionEl = null;
    var textHistory = new Map();
    var convHistory = [];
    var lastQuestion = '';
    var lastApiCall = 0;
    var cleanupInterval = null;
    var scanInterval = null;

    // Known caption container selectors (covers multiple Meet versions)
    var CAPTION_SELS = [
        '.a4cQT', '.iOzk7', '[jscontroller].T4LgNb',
        'div[class*="iOzk7"]', 'div[class*="a4cQT"]',
        '.bh44bd', '.zSfwGf', '.iTTPOb',
        '[jsname="tgaKEf"]', '[jsname="dsyhDe"]',
        'div[aria-live="polite"]', 'div[aria-live="assertive"]'
    ];

    // UI references
    var qEl = null, ansEl = null, statEl = null, toggleBtn = null;
    var resumeText = GM_getValue('resume_text', '');
    if (resumeText.length > 3000) resumeText = resumeText.substring(0, 3000) + '...';

    // Restore conversation history
    try { var _sc = GM_getValue('conv_history', ''); if (_sc) convHistory = JSON.parse(_sc); } catch (e) { convHistory = []; }

    function log() { if (typeof console !== 'undefined') console.log.apply(console, ['[IE]'].concat(Array.prototype.slice.call(arguments))); }

    // STT corrections
    var STT_FIXES = {
        'sequel': 'SQL', 'my sequel': 'MySQL', 'post gress': 'Postgres',
        'no js': 'Node.js', 'react js': 'React.js', 'next js': 'Next.js',
        'mongo db': 'MongoDB', 'fire base': 'Firebase', 'type script': 'TypeScript',
        'java script': 'JavaScript', 'web socket': 'WebSocket',
        'oop': 'OOP', 'api': 'API', 'rest api': 'REST API', 'graphql': 'GraphQL',
        'ci cd': 'CI/CD', 'dev ops': 'DevOps', 'kubernetes': 'Kubernetes',
        'docker': 'Docker', 'aws': 'AWS', 'azure': 'Azure',
        'tensor flow': 'TensorFlow', 'pie torch': 'PyTorch', 'numpy': 'NumPy',
        'pandas': 'Pandas', 'scikit learn': 'scikit-learn',
        'gradient descendant': 'gradient descent', 'gradient dissent': 'gradient descent'
    };
    var FILLER_RE = /\b(um+|uh+|ah+|like|you know|i mean|basically|actually|so+|well)\b/gi;

    function cleanTranscript(text) {
        var cleaned = text.replace(FILLER_RE, ' ').replace(/\s{2,}/g, ' ').trim();
        var lower = cleaned.toLowerCase();
        for (var key in STT_FIXES) {
            if (lower.indexOf(key) !== -1) cleaned = cleaned.replace(new RegExp(key, 'gi'), STT_FIXES[key]);
        }
        return cleaned;
    }

    // ─── 1. CAPTION SCRAPING ───────────────────────────────────────────────
    function enableCaptions() {
        var sels = ['button[aria-label*="caption" i]', 'button[aria-label*="subtitle" i]', 'button[data-tooltip*="caption" i]', '[aria-label*="Turn on captions" i]'];
        for (var i = 0; i < sels.length; i++) {
            var btn = document.querySelector(sels[i]);
            if (btn) { btn.click(); return true; }
        }
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', bubbles: true }));
        return false;
    }

    function isInCaptionContainer(el) {
        for (var i = 0; i < CAPTION_SELS.length; i++) {
            try { if (el.closest(CAPTION_SELS[i])) return true; } catch (e) { }
        }
        try { if (el.closest('[aria-live]')) return true; } catch (e) { }
        return false;
    }

    function scanForCaptions() {
        for (var i = 0; i < CAPTION_SELS.length; i++) {
            try {
                var containers = document.querySelectorAll(CAPTION_SELS[i]);
                for (var j = 0; j < containers.length; j++) {
                    var spans = containers[j].querySelectorAll('span');
                    for (var s = 0; s < spans.length; s++) {
                        var t = spans[s].textContent && spans[s].textContent.trim();
                        if (t && t.length >= 3 && t.length <= 500) trackElement(spans[s]);
                    }
                }
            } catch (e) { }
        }
    }

    function startObserver() {
        if (observer) observer.disconnect();
        textHistory.clear();
        // Hide native captions (broader selectors)
        var style = document.createElement('style');
        style.id = 'stt-hide';
        style.textContent = '.a4cQT,.iOzk7,[jscontroller].T4LgNb,div[class*="iOzk7"],div[class*="a4cQT"],.bh44bd,.zSfwGf,.iTTPOb,[jsname="tgaKEf"],[jsname="dsyhDe"]{opacity:0!important;pointer-events:none!important;}';
        if (!document.getElementById('stt-hide')) document.head.appendChild(style);

        observer = new MutationObserver(function (mutations) {
            for (var m = 0; m < mutations.length; m++) {
                var mut = mutations[m];
                if (mut.type === 'characterData' && mut.target.parentElement) trackElement(mut.target.parentElement);
                if (mut.type === 'childList') {
                    for (var n = 0; n < mut.addedNodes.length; n++) {
                        var node = mut.addedNodes[n];
                        if (node.nodeType === 3 && node.parentElement) trackElement(node.parentElement);
                        if (node.nodeType === 1) {
                            trackElement(node);
                            if (node.querySelectorAll) {
                                var spans = node.querySelectorAll('span, div');
                                for (var s = 0; s < spans.length; s++) trackElement(spans[s]);
                            }
                        }
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });

        // Periodic cleanup: remove DOM-detached elements from textHistory
        if (cleanupInterval) clearInterval(cleanupInterval);
        cleanupInterval = setInterval(function () {
            textHistory.forEach(function (v, k) { if (!document.body.contains(k)) textHistory.delete(k); });
        }, 15000);

        // Periodic fallback scan for captions (catches anything MutationObserver missed)
        if (scanInterval) clearInterval(scanInterval);
        scanInterval = setInterval(function () { if (isActive) scanForCaptions(); }, 3000);

        log('Observer started, cleanup+scan intervals active');
    }

    function trackElement(el) {
        if (!el || !el.textContent) return;
        if (el.closest('#ie-wrap') || el.closest('button') || el.closest('[role="toolbar"]') || el.closest('[role="navigation"]') || el.closest('input') || el.closest('textarea')) return;
        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
        var text = el.textContent.trim();
        if (!text || text.length < 3) return;

        var inCaption = isInCaptionContainer(el);

        // Position filter — skip if already inside a known caption container
        if (!inCaption) {
            var rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            if (rect.top < window.innerHeight * 0.2) return;
            if (rect.top > window.innerHeight || rect.bottom < 0) return;
        }

        var hist = textHistory.get(el);
        if (!hist) { hist = { prevText: '', changeCount: 0 }; textHistory.set(el, hist); }
        if (text !== hist.prevText) {
            hist.changeCount++;
            hist.prevText = text;
            if (inCaption || hist.changeCount >= 2) handleCaption(text, el);
        }
    }

    function extractNewText(fullText) {
        // Reset stale lastFinalizedText after 30s of silence
        if (lastFinalizedTime && (Date.now() - lastFinalizedTime > 30000)) {
            log('Reset lastFinalizedText after 30s inactivity');
            lastFinalizedText = '';
            lastFinalizedLength = 0;
        }
        if (!lastFinalizedText) return fullText;
        if (fullText === lastFinalizedText) return null;

        // Strategy 1: Exact prefix match (ideal case — no STT corrections)
        if (fullText.startsWith(lastFinalizedText)) {
            var np = fullText.slice(lastFinalizedText.length).trim();
            return np.length >= 2 ? np : null;
        }

        // Strategy 2: Tail/suffix match — handles STT retroactively correcting earlier text
        // Use last 80 chars of lastFinalizedText as anchor
        var tailLen = Math.min(80, lastFinalizedText.length);
        var tail = lastFinalizedText.slice(-tailLen);
        var tailIdx = fullText.lastIndexOf(tail);
        if (tailIdx !== -1) {
            var np2 = fullText.slice(tailIdx + tail.length).trim();
            return np2.length >= 2 ? np2 : null;
        }

        // Strategy 3: Length-based — if full text grew since last finalization, extract the tail
        if (fullText.length > lastFinalizedLength + 3) {
            var diff = fullText.length - lastFinalizedLength;
            // Grab extra context to find a clean sentence boundary
            var rawNew = fullText.slice(-(diff + 30)).trim();
            var dotIdx = rawNew.indexOf('. ');
            if (dotIdx !== -1 && dotIdx < 40) rawNew = rawNew.slice(dotIdx + 2);
            return rawNew.length >= 3 ? rawNew : null;
        }

        // Text changed but didn't grow — likely just an STT correction, ignore
        return null;
    }

    function handleCaption(text, el) {
        if (currentCaptionEl && currentCaptionEl !== el) {
            // Only read previous element if it's still in the DOM
            if (document.body.contains(currentCaptionEl)) {
                var prev = currentCaptionEl.textContent?.trim();
                if (prev) { var np = extractNewText(prev); if (np) finalizeCaption(np, prev); }
            }
        }
        currentCaptionEl = el;
        var newPart = extractNewText(text);
        if (newPart && qEl) qEl.textContent = '🎤 "' + newPart + '"';
        if (statEl && isActive) statEl.textContent = 'Hearing...';
        if (finalizeTimer) clearTimeout(finalizeTimer);
        finalizeTimer = setTimeout(function () { var np = extractNewText(text); if (np) finalizeCaption(np, text); }, FINALIZE_DELAY);
    }

    function finalizeCaption(newText, fullText) {
        if (!newText || newText.length < 3) return;
        var cleaned = cleanTranscript(newText);
        if (cleaned.length < 3) return;
        // Only advance the cursor AFTER we confirm we'll use this text
        // Keep only last 300 chars — sliding window so memory stays constant for any interview length
        var ft = fullText || newText;
        lastFinalizedText = ft.length > 300 ? ft.slice(-300) : ft;
        lastFinalizedLength = ft.length;
        lastFinalizedTime = Date.now();
        log('Finalized caption:', cleaned.substring(0, 80));
        if (qEl) qEl.textContent = 'Q: "' + cleaned + '"';
        if (statEl) statEl.textContent = 'Sending to AI...';
        sendToAI(cleaned);
    }

    function stopObserver() {
        if (observer) { observer.disconnect(); observer = null; }
        if (finalizeTimer) { clearTimeout(finalizeTimer); finalizeTimer = null; }
        if (cleanupInterval) { clearInterval(cleanupInterval); cleanupInterval = null; }
        if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
        textHistory.clear();
        var s = document.getElementById('stt-hide');
        if (s) s.remove();
    }

    // ─── 2. AI SYSTEM PROMPT ───────────────────────────────────────────────
    function buildSystemPrompt() {
        var r = resumeText ? '\n\n=== CANDIDATE RESUME ===\n' + resumeText + '\n=== END RESUME ===' : '';
        var p = 'You ARE the candidate in a live job interview for the role of ' + ROLE + ' at ' + COMPANY + '.';
        p += ' The interviewer\'s question comes from speech-to-text (may contain errors — interpret intelligently).';
        p += ' Write exactly what YOU would say out loud as the candidate.' + r;
        p += '\n\n## CONTEXT RESOLUTION';
        p += '\nWhen the interviewer says "it", "that", "this", "the previous one", "what about" — ALWAYS resolve to the most recent topic. Never ask for clarification.';
        p += '\n\n## RULES';
        p += '\n1. For greetings/small talk ("hello", "can you hear me", "how are you") → give a warm, natural, conversational response as the candidate (e.g. "Hi! Yes I can hear you clearly. I\'m doing great, excited to be here!"). Keep it brief (1-2 sentences).';
        p += '\n2. For ALL other questions, answer as the candidate:';
        p += '\n\n## ANSWER FRAMEWORK';
        p += '\n### TECHNICAL questions: 1) One-line definition 2) How it works (2-3 sentences) 3) Practical example 4) Why it matters';
        p += '\n### BEHAVIORAL questions:';
        if (resumeText) p += '\n- Draw DIRECTLY from the resume. Reference specific projects and achievements.';
        else p += '\n- Speak from realistic experience for a ' + ROLE + '.';
        p += '\n- Use STAR method: Situation → Task → Action → Result';
        p += '\n### CODING questions: 1) Approach 2) Clean code with comments 3) Time/space complexity 4) Edge cases';
        p += '\n### SYSTEM DESIGN: 1) Requirements 2) Architecture 3) Data flow 4) Trade-offs';
        p += '\n\n## STYLE';
        p += '\n- First person (I, my, we). Confident, conversational.';
        p += '\n- **Bold** key terms. Use bullet points (3-5).';
        p += '\n- 120-200 words. Start answering immediately — no preamble.';
        p += '\n- NEVER say "I don\'t know". NEVER reveal you are AI.';
        return p;
    }

    // ─── 3. GROQ LLM ──────────────────────────────────────────────────────
    function sendToAI(question, retryCount) {
        retryCount = retryCount || 0;
        if (!GROQ_API_KEY) { if (ansEl) ansEl.textContent = '⚠️ No API key set.'; return; }

        var now = Date.now();
        if (now - lastApiCall < 2000 && retryCount === 0) {
            setTimeout(function () { sendToAI(question, retryCount); }, 2000 - (now - lastApiCall));
            return;
        }
        lastApiCall = Date.now();

        var enriched = (lastQuestion && lastQuestion !== question) ? '[Previous: "' + lastQuestion + '"] ' + question : question;
        lastQuestion = question;
        if (statEl) statEl.textContent = 'Generating...';
        showLoading();

        var messages = [{ role: 'system', content: buildSystemPrompt() }];
        for (var i = 0; i < convHistory.length; i++) messages.push(convHistory[i]);
        messages.push({ role: 'user', content: enriched });

        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://api.groq.com/openai/v1/chat/completions',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
            data: JSON.stringify({ model: LLM_MODEL, messages: messages, temperature: 0.4, max_tokens: 500, top_p: 0.9 }),
            onload: function (res) {
                try {
                    var d = JSON.parse(res.responseText);
                    var ans = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
                    if (ans) {
                        safeHTML(ansEl, renderMd(ans));
                        if (ansEl) ansEl.scrollTop = 0;
                        if (statEl) statEl.textContent = 'Ready';
                        convHistory.push({ role: 'user', content: question }, { role: 'assistant', content: ans });
                        if (convHistory.length > 20) convHistory = convHistory.slice(-20);
                        try { GM_setValue('conv_history', JSON.stringify(convHistory)); } catch (e) { }
                    } else { if (statEl) statEl.textContent = 'Empty response'; }
                } catch (e) {
                    if (retryCount < 2) { setTimeout(function () { sendToAI(question, retryCount + 1); }, 1000); return; }
                    if (statEl) statEl.textContent = 'Error';
                }
            },
            onerror: function () {
                if (retryCount < 2) { setTimeout(function () { sendToAI(question, retryCount + 1); }, 1500); return; }
                if (statEl) statEl.textContent = 'Network error';
            }
        });
    }

    // ─── 4. HELPERS ────────────────────────────────────────────────────────
    var policy = null;
    try { if (window.trustedTypes && window.trustedTypes.createPolicy) policy = window.trustedTypes.createPolicy('ie', { createHTML: function (s) { return s; } }); } catch (e) { }
    function safeHTML(el, html) { try { if (policy) el.innerHTML = policy.createHTML(html); else el.innerHTML = html; } catch (e) { el.textContent = html.replace(/<[^>]*>/g, ''); } }

    function renderMd(text) {
        return text
            .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(255,255,255,0.06);padding:8px 12px;border-radius:6px;font-size:11px;overflow-x:auto;margin:4px 0"><code>$1</code></pre>')
            .replace(/\*\*(.*?)\*\*/g, '<b style="color:#93c5fd">$1</b>')
            .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;font-size:12px">$1</code>')
            .replace(/^(\d+)\.\s(.+)/gm, '<li style="margin:2px 0;margin-left:16px;list-style:decimal">$2</li>')
            .replace(/^[-•]\s(.+)/gm, '<li style="margin:2px 0;margin-left:16px;list-style:disc">$1</li>')
            .replace(/\n/g, '<br>');
    }

    function showLoading() {
        safeHTML(ansEl, '<div class="ie-loading-dots" style="padding:8px 0"><span></span><span></span><span></span><span style="margin-left:8px;color:#64748b;font-size:11px;vertical-align:middle">Thinking...</span></div>');
    }

    function el(tag, s, txt, kids) {
        var e = document.createElement(tag);
        if (s) Object.assign(e.style, s);
        if (txt) e.textContent = txt;
        if (kids) kids.forEach(function (c) { if (c) e.appendChild(c); });
        return e;
    }

    // ─── 5. UI ─────────────────────────────────────────────────────────────
    function initUI() {
        // Load Inter font
        var fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);

        var css = document.createElement('style');
        css.textContent = [
            '@keyframes ie-pulse{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1.1)}}',
            '@keyframes ie-fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}',
            '@keyframes ie-glow{0%,100%{box-shadow:0 0 4px rgba(99,179,237,0.3)}50%{box-shadow:0 0 12px rgba(99,179,237,0.6)}}',
            '#ie-wrap{transition:opacity .3s,transform .3s}',
            '#ie-wrap.ie-hidden{opacity:0;pointer-events:none}',
            '#ie-wrap.ie-active{animation:ie-glow 2s ease-in-out infinite}',
            '.ie-loading-dots span{display:inline-block;width:6px;height:6px;margin:0 3px;border-radius:50%;background:#63b3ed;animation:ie-pulse 1.2s infinite}',
            '.ie-loading-dots span:nth-child(2){animation-delay:.15s}',
            '.ie-loading-dots span:nth-child(3){animation-delay:.3s}',
            '.ie-copy-btn{opacity:0;transition:opacity .2s;position:absolute;top:6px;right:8px;background:rgba(99,179,237,.15);border:1px solid rgba(99,179,237,.3);color:#90cdf4;border-radius:5px;font-size:10px;padding:2px 8px;cursor:pointer}',
            '.ie-ans-wrap:hover .ie-copy-btn{opacity:1}',
            '.ie-status-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px;vertical-align:middle}',
            '.ie-status-dot.on{background:#34d399;box-shadow:0 0 6px rgba(52,211,153,0.5)}',
            '.ie-status-dot.off{background:#64748b}',
            '#ie-wrap button:hover{filter:brightness(1.2)}',
            '#ie-wrap button:active{transform:scale(0.97)}',
        ].join('\n');
        document.head.appendChild(css);

        var S = {
            wrap: { position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', width: '560px', background: 'rgba(6,10,24,0.94)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,179,237,0.4)', borderRadius: '14px', zIndex: '2147483647', fontFamily: 'Inter,system-ui,sans-serif', color: '#f1f5f9', boxShadow: '0 12px 48px rgba(0,0,0,0.7)', overflow: 'hidden' },
            head: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'rgba(99,179,237,0.1)', borderBottom: '1px solid rgba(99,179,237,0.15)', cursor: 'grab', userSelect: 'none' },
            logo: { fontSize: '14px', fontWeight: '700', color: '#90cdf4' },
            badge: { fontSize: '10px', fontWeight: '500', color: '#63b3ed', padding: '2px 8px', background: 'rgba(99,179,237,0.1)', border: '1px solid rgba(99,179,237,0.2)', borderRadius: '10px' },
            stat: { fontSize: '11px', color: '#64748b', marginLeft: 'auto' },
            btn: { background: 'rgba(99,179,237,0.15)', border: '1px solid rgba(99,179,237,0.3)', color: '#90cdf4', borderRadius: '6px', fontSize: '11px', padding: '3px 10px', cursor: 'pointer' },
            xBtn: { background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '18px', lineHeight: '1' },
            q: { padding: '5px 14px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px solid rgba(255,255,255,0.04)', minHeight: '24px' },
            ans: { padding: '10px 14px', fontSize: '13px', lineHeight: '1.65', color: '#e2e8f0', maxHeight: '200px', overflowY: 'auto' },
            foot: { padding: '4px 14px', fontSize: '10px', color: '#334155', display: 'flex', gap: '12px' },
            typeRow: { display: 'flex', gap: '6px', padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' },
            typeInput: { flex: '1', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', color: '#f1f5f9', fontFamily: 'Inter,system-ui,sans-serif', outline: 'none' },
            sendBtn: { background: 'rgba(99,179,237,0.2)', border: '1px solid rgba(99,179,237,0.35)', color: '#90cdf4', borderRadius: '8px', fontSize: '12px', padding: '6px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }
        };

        statEl = el('span', S.stat, 'Click Start');
        toggleBtn = el('button', S.btn, 'Start');
        var regenBtn = el('button', S.btn, 'Regen');
        var closeBtn = el('button', S.xBtn, 'x');
        var typeInput = el('input', S.typeInput);
        typeInput.placeholder = 'Type a question...';
        typeInput.type = 'text';
        var sendBtnEl = el('button', S.sendBtn, 'Ask');
        var resumeBtn = el('button', S.btn, resumeText ? 'Resume ✓' : 'Resume');

        qEl = el('div', S.q, 'Captions will appear here...');
        ansEl = el('div', S.ans, 'Click Start to begin, or type below.');

        var copyBtn = el('button', null, 'Copy');
        copyBtn.className = 'ie-copy-btn';
        copyBtn.onclick = function () {
            navigator.clipboard.writeText(ansEl.innerText || ansEl.textContent).then(function () {
                copyBtn.textContent = 'Copied!'; setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
            });
        };

        var ansWrap = el('div', { position: 'relative' });
        ansWrap.className = 'ie-ans-wrap';
        ansWrap.appendChild(ansEl);
        ansWrap.appendChild(copyBtn);

        var head = el('div', S.head, null, [
            el('span', S.logo, '🦅 InterviEagle AI'),
            el('span', S.badge, ROLE + ' @ ' + COMPANY),
            statEl, toggleBtn, regenBtn, resumeBtn, closeBtn
        ]);
        var typeRow = el('div', S.typeRow, null, [typeInput, sendBtnEl]);
        var foot = el('div', S.foot, null, [el('span', null, 'Alt+P: toggle'), el('span', null, 'Alt+C: clear')]);

        var wrap = el('div', null, null, [head, qEl, ansWrap, typeRow, foot]);
        Object.assign(wrap.style, S.wrap);
        wrap.id = 'ie-wrap';
        document.body.appendChild(wrap);

        // ── Resume modal ──
        var modal = el('div', { display: 'none', position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.7)', zIndex: '2147483648', alignItems: 'center', justifyContent: 'center' });
        var modalBox = el('div', { background: '#0f172a', border: '1px solid rgba(99,179,237,0.4)', borderRadius: '12px', padding: '20px', width: '500px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '10px' });
        var modalTA = el('textarea', { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', fontSize: '11px', color: '#e2e8f0', resize: 'vertical', height: '200px', width: '100%', outline: 'none', boxSizing: 'border-box' });
        modalTA.value = resumeText;
        modalTA.placeholder = 'Paste resume text here...';
        modalTA.addEventListener('keydown', function (e) { e.stopPropagation(); });
        var modalSave = el('button', S.sendBtn, 'Save');
        var modalClose = el('button', S.btn, 'Cancel');
        var modalRow = el('div', { display: 'flex', gap: '8px', justifyContent: 'flex-end' }, null, [modalClose, modalSave]);
        modalBox.appendChild(el('div', { fontSize: '13px', fontWeight: '600', color: '#90cdf4' }, 'Paste your resume text'));
        modalBox.appendChild(modalTA);
        modalBox.appendChild(modalRow);
        modal.appendChild(modalBox);
        document.body.appendChild(modal);

        resumeBtn.onclick = function () { modal.style.display = 'flex'; };
        modalClose.onclick = function () { modal.style.display = 'none'; };
        modalSave.onclick = function () {
            resumeText = modalTA.value.trim();
            GM_setValue('resume_text', resumeText);
            resumeBtn.textContent = resumeText ? 'Resume ✓' : 'Resume';
            modal.style.display = 'none';
        };

        // ── Drag ──
        var dg = { on: false, sx: 0, sy: 0, ox: 0, oy: 0 };
        head.addEventListener('mousedown', function (e) {
            if (e.target.tagName === 'BUTTON') return;
            dg.on = true; dg.sx = e.clientX; dg.sy = e.clientY;
            var r = wrap.getBoundingClientRect(); dg.ox = r.left; dg.oy = r.top;
            wrap.style.transform = 'none'; wrap.style.left = r.left + 'px'; wrap.style.top = r.top + 'px';
        });
        document.addEventListener('mousemove', function (e) { if (!dg.on) return; wrap.style.left = (dg.ox + e.clientX - dg.sx) + 'px'; wrap.style.top = (dg.oy + e.clientY - dg.sy) + 'px'; });
        document.addEventListener('mouseup', function () { dg.on = false; });

        // ── Toggle ──
        toggleBtn.onclick = function () {
            isActive = !isActive;
            toggleBtn.textContent = isActive ? 'Pause' : 'Start';
            if (isActive) {
                enableCaptions();
                setTimeout(startObserver, 1500);
                statEl.innerHTML = '<span class="ie-status-dot on"></span> Listening...';
                wrap.classList.add('ie-active');
            } else {
                stopObserver();
                statEl.innerHTML = '<span class="ie-status-dot off"></span> Paused';
                wrap.classList.remove('ie-active');
            }
        };

        // ── Text input ──
        function submitTyped() { var q = typeInput.value.trim(); if (!q) return; qEl.textContent = 'Typed: "' + q + '"'; typeInput.value = ''; sendToAI(q); }
        sendBtnEl.onclick = submitTyped;
        typeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitTyped(); } e.stopPropagation(); });
        typeInput.addEventListener('keyup', function (e) { e.stopPropagation(); });

        // ── Shortcuts ──
        regenBtn.onclick = function () { if (lastQuestion) sendToAI(lastQuestion); };
        closeBtn.onclick = function () { wrap.classList.add('ie-hidden'); };
        document.addEventListener('keydown', function (e) {
            if (e.altKey && e.key === 'p') wrap.classList.toggle('ie-hidden');
            if (e.altKey && e.key === 'c') { qEl.textContent = ''; ansEl.textContent = 'Cleared.'; convHistory = []; }
        });

        // Keep panel alive if Meet removes it
        new MutationObserver(function () { if (!document.getElementById('ie-wrap')) document.body.appendChild(wrap); }).observe(document.body, { childList: true });
    }

    // ─── BOOT ──────────────────────────────────────────────────────────────
    function boot() { if (document.body) { initUI(); return; } var w = setInterval(function () { if (document.body) { clearInterval(w); initUI(); } }, 50); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else setTimeout(boot, 2000);
})();
