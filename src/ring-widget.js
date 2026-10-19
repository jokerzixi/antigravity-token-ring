/**
 * Antigravity Token Ring - Renderer / Preload UI Widget
 * 
 * Accurately anchors a compact SVG circular progress ring right beside the
 * send button on the bottom-right of the input box.
 */

(function () {
    if (window.__AGY_TOKEN_RING_LOADED__) return;
    window.__AGY_TOKEN_RING_LOADED__ = true;

    let ipcRenderer = null;
    try {
        const electron = require('electron');
        ipcRenderer = electron.ipcRenderer;
    } catch (e) {
        console.warn('[TokenRing] Electron IPC not available via require');
    }

    const MODEL_LIMITS = {
        'pro': 2097152,       // Gemini 2.5 Pro (2M)
        'flash': 1048576,     // Gemini 3.8 / 2.5 Flash (1M)
        'gemini': 1048576,    // Gemini Standard (1M)
        'claude': 200000,     // Claude 3.5 / 3.7 Sonnet (200k)
        'sonnet': 200000,     // Claude Sonnet (200k)
        'deepseek': 128000,   // DeepSeek V3 / R1 (128k)
        'default': 1048576    // Fallback Default (1M)
    };

    let isThinking = false;
    let latestStats = {
        context: 0,
        hitRate: '0.0',
        sessionInput: 0,
        sessionHit: 0,
        sessionOut: 0,
        calls: 0,
        costUsd: '0.0000',
        costCny: '0.00',
        todayTokens: 0
    };

    function injectStyles() {
        if (document.getElementById('agy-token-ring-styles')) return;
        const style = document.createElement('style');
        style.id = 'agy-token-ring-styles';
        style.textContent = `
            .agy-token-ring-btn {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                position: relative !important;
                width: 24px !important;
                height: 24px !important;
                cursor: pointer !important;
                user-select: none !important;
                margin: 0 !important;
                vertical-align: middle !important;
                flex-shrink: 0 !important;
                z-index: 50 !important;
            }
            .agy-token-ring-svg {
                transform: rotate(-90deg);
                width: 22px;
                height: 22px;
            }
            .agy-token-ring-bg {
                fill: none;
                stroke: rgba(148, 163, 184, 0.25);
                stroke-width: 2.6;
            }
            .agy-token-ring-fg {
                fill: none;
                stroke-width: 2.6;
                stroke-linecap: round;
                transition: stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s ease;
            }
            .agy-token-ring-spin {
                animation: agy-ring-spin 0.9s linear infinite;
                transform-origin: center;
            }
            @keyframes agy-ring-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .agy-token-card {
                position: absolute !important;
                bottom: 34px !important;
                right: 0 !important;
                width: 250px !important;
                background: rgba(17, 24, 39, 0.96) !important;
                backdrop-filter: blur(16px) !important;
                -webkit-backdrop-filter: blur(16px) !important;
                border: 1px solid rgba(255, 255, 255, 0.16) !important;
                border-radius: 10px !important;
                padding: 12px 14px !important;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6) !important;
                color: #f1f5f9 !important;
                font-size: 11px !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                pointer-events: none !important;
                opacity: 0 !important;
                transform: translateY(6px) !important;
                transition: opacity 0.2s ease, transform 0.2s ease !important;
                z-index: 99999 !important;
                line-height: 1.5 !important;
            }
            .agy-token-ring-btn:hover .agy-token-card {
                pointer-events: auto !important;
                opacity: 1 !important;
                transform: translateY(0) !important;
            }
            .agy-card-row {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                margin-bottom: 4px !important;
            }
            .agy-card-label {
                color: #94a3b8 !important;
                font-size: 11px !important;
            }
            .agy-card-val {
                font-weight: 600 !important;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
            }
            .agy-card-divider {
                height: 1px !important;
                background: rgba(255, 255, 255, 0.1) !important;
                margin: 7px 0 !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function detectModelLimit() {
        const text = (document.body ? document.body.innerText : '').toLowerCase();
        if (text.includes('claude') || text.includes('sonnet')) return MODEL_LIMITS.claude;
        if (text.includes('deepseek')) return MODEL_LIMITS.deepseek;
        if (text.includes('pro')) return MODEL_LIMITS.pro;
        if (text.includes('flash')) return MODEL_LIMITS.flash;
        return MODEL_LIMITS.default;
    }

    async function fetchStats() {
        if (!ipcRenderer) return latestStats;
        try {
            const res = await ipcRenderer.invoke('antigravity:get-token-stats');
            if (res && res.success) {
                latestStats = res;
                return res;
            }
        } catch (e) {
            console.error('[TokenRing] IPC fetch error:', e);
        }
        return latestStats;
    }

    function createRingDOM() {
        const wrap = document.createElement('div');
        wrap.className = 'agy-token-ring-btn';
        wrap.setAttribute('aria-label', 'Token Usage & Quota');
        wrap.setAttribute('tabindex', '0');

        const radius = 8.5;
        const circ = 2 * Math.PI * radius; // ~53.4

        wrap.innerHTML = `
            <svg class="agy-token-ring-svg" viewBox="0 0 22 22">
                <circle class="agy-token-ring-bg" cx="11" cy="11" r="${radius}"></circle>
                <circle class="agy-token-ring-fg" cx="11" cy="11" r="${radius}"
                    stroke-dasharray="${circ}" stroke-dashoffset="${circ * 0.95}" stroke="#10b981">
                </circle>
            </svg>
            <div class="agy-token-card">
                <div class="agy-card-row" style="font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px; margin-bottom: 7px;">
                    <span style="display:flex; align-items:center; gap:5px;">
                        <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#10b981;" id="agy-card-dot"></span>
                        上下文配额
                    </span>
                    <span id="agy-card-pct" style="color: #10b981;">0.0%</span>
                </div>
                <div class="agy-card-row">
                    <span class="agy-card-label">会话占用:</span>
                    <span class="agy-card-val" id="agy-card-ctx">0k / 1.0M</span>
                </div>
                <div class="agy-card-row">
                    <span class="agy-card-label">Prompt 命中率:</span>
                    <span class="agy-card-val" id="agy-card-hit">0.0%</span>
                </div>
                <div class="agy-card-row">
                    <span class="agy-card-label">对话轮次:</span>
                    <span class="agy-card-val" id="agy-card-calls">0 次</span>
                </div>
                <div class="agy-card-divider"></div>
                <div class="agy-card-row">
                    <span class="agy-card-label">今日总消耗:</span>
                    <span class="agy-card-val" id="agy-card-today">0</span>
                </div>
                <div class="agy-card-row">
                    <span class="agy-card-label">本会话花费:</span>
                    <span class="agy-card-val" style="color:#f59e0b;" id="agy-card-cost">$0.00 (≈¥0.00)</span>
                </div>
                <div style="text-align:center; color:#64748b; font-size:10px; margin-top:6px; border-top:1px dashed rgba(255,255,255,0.08); padding-top:4px;">
                    点击圆环立即强制刷新
                </div>
            </div>
        `;

        wrap.addEventListener('click', async (e) => {
            e.stopPropagation();
            await fetchStats();
            updateRingDOM(wrap);
        });

        return wrap;
    }

    function updateRingDOM(wrap) {
        if (!wrap) return;
        const fg = wrap.querySelector('.agy-token-ring-fg');
        const svg = wrap.querySelector('.agy-token-ring-svg');
        if (!fg || !svg) return;

        if (isThinking) {
            svg.classList.add('agy-token-ring-spin');
            fg.style.strokeDashoffset = '36';
            fg.style.stroke = '#3b82f6';
            return;
        } else {
            svg.classList.remove('agy-token-ring-spin');
        }

        const limit = detectModelLimit();
        const radius = 8.5;
        const circ = 2 * Math.PI * radius;
        const ratio = Math.min(1.0, (latestStats.context || 0) / limit);
        const offset = circ * (1 - ratio);
        const pct = (ratio * 100).toFixed(1);

        let color = '#10b981'; // 绿
        if (ratio >= 0.8) color = '#ef4444'; // 红
        else if (ratio >= 0.6) color = '#f59e0b'; // 黄

        fg.style.stroke = color;
        fg.style.strokeDashoffset = String(offset);

        const pctEl = wrap.querySelector('#agy-card-pct');
        const dotEl = wrap.querySelector('#agy-card-dot');
        if (pctEl) {
            pctEl.innerText = pct + '%';
            pctEl.style.color = color;
        }
        if (dotEl) {
            dotEl.style.background = color;
        }

        const ctxEl = wrap.querySelector('#agy-card-ctx');
        if (ctxEl) {
            ctxEl.innerText = `${((latestStats.context || 0) / 1e3).toFixed(1)}k / ${(limit / 1e6).toFixed(1)}M`;
        }

        const hitEl = wrap.querySelector('#agy-card-hit');
        if (hitEl) {
            hitEl.innerText = `${latestStats.hitRate || '0.0'}%`;
            hitEl.style.color = parseFloat(latestStats.hitRate) >= 80 ? '#10b981' : (parseFloat(latestStats.hitRate) >= 60 ? '#f59e0b' : '#ef4444');
        }

        const callsEl = wrap.querySelector('#agy-card-calls');
        if (callsEl) {
            callsEl.innerText = `${latestStats.calls || 0} 次`;
        }

        const todayEl = wrap.querySelector('#agy-card-today');
        if (todayEl) {
            todayEl.innerText = `${((latestStats.todayTokens || 0) / 1e3).toFixed(1)}k tokens`;
        }

        const costEl = wrap.querySelector('#agy-card-cost');
        if (costEl) {
            costEl.innerText = `$${latestStats.costUsd || '0.0000'} (≈¥${latestStats.costCny || '0.00'})`;
        }
    }

    function scanAndMount() {
        injectStyles();

        // 1. 全局清理多余的重复圆环（保证每个界面最多只有 1 个）
        const allRings = document.querySelectorAll('.agy-token-ring-btn');
        if (allRings.length > 1) {
            for (let i = 1; i < allRings.length; i++) {
                allRings[i].remove();
            }
        }

        // 2. 精确查找发送按钮 (支持正常发送、排队发送、发送中、取消/终止所有状态)
        const sendBtn = document.querySelector('[data-testid="send-button"]') ||
                        document.querySelector('[data-testid="send-button-pending"]') ||
                        document.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]') ||
                        document.querySelector('button[aria-label*="Send message"]') ||
                        document.querySelector('button[aria-label*="发送"]') ||
                        document.querySelector('button[aria-label*="Cancel"]') ||
                        document.querySelector('button[aria-label*="取消"]') ||
                        document.querySelector('button[aria-label*="Stop"]') ||
                        document.querySelector('button[aria-label*="停止"]');

        let ring = document.querySelector('.agy-token-ring-btn');

        if (sendBtn) {
            // 定位发送按钮的外层 flex 容器 (通常是包裹麦克风和发送按钮的 flex div)
            const sendContainer = sendBtn.closest('.flex') || sendBtn;
            const parent = sendContainer.parentElement;

            if (parent) {
                if (!ring) {
                    ring = createRingDOM();
                }

                // 如果当前未挂载在发送按钮左侧，则移动过去
                if (ring.nextElementSibling !== sendContainer && ring.nextElementSibling !== sendBtn) {
                    parent.insertBefore(ring, sendContainer);
                }
                updateRingDOM(ring);
            }
        } else {
            // 兜底：如果尚未找到发送按钮，精确定位右下角操作栏 (gap-1.5 flex 容器)
            const rightToolbar = document.querySelector('[id="antigravity.agentSidePanelInputBox"] .flex.items-center.gap-1\\.5') ||
                                 document.querySelector('#antigravity\\.agentSidePanelInputBox .flex.items-center.gap-1\\.5') ||
                                 document.querySelector('[data-testid="agent-input-box"] .flex.items-center.gap-1\\.5');
            if (rightToolbar) {
                if (!ring) {
                    ring = createRingDOM();
                }
                if (ring.parentElement !== rightToolbar) {
                    rightToolbar.appendChild(ring);
                }
                updateRingDOM(ring);
            }
        }

        // 3. 监听发送与回车行为
        const inputField = document.querySelector('[data-lexical-editor="true"], textarea, [contenteditable="true"]');
        if (inputField && !inputField.__agy_ring_enter__) {
            inputField.__agy_ring_enter__ = true;
            inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    isThinking = true;
                    document.querySelectorAll('.agy-token-ring-btn').forEach(updateRingDOM);
                }
            });
        }

        document.querySelectorAll('[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="发送"], button[aria-label*="Stop"]').forEach(btn => {
            if (!btn.__agy_ring_bound__) {
                btn.__agy_ring_bound__ = true;
                btn.addEventListener('click', () => {
                    isThinking = true;
                    document.querySelectorAll('.agy-token-ring-btn').forEach(updateRingDOM);
                });
            }
        });
    }

    // 定期轮询与状态同步
    setInterval(async () => {
        scanAndMount();

        const isCurrentlyThinking = !!document.querySelector('button[aria-label*="Stop"], button[aria-label*="停止"], button[aria-label*="Cancel"]');
        if (isThinking && !isCurrentlyThinking) {
            isThinking = false;
            await fetchStats();
            document.querySelectorAll('.agy-token-ring-btn').forEach(updateRingDOM);
        } else if (!isThinking && !isCurrentlyThinking) {
            await fetchStats();
            document.querySelectorAll('.agy-token-ring-btn').forEach(updateRingDOM);
        }
    }, 2000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            scanAndMount();
            fetchStats().then(() => document.querySelectorAll('.agy-token-ring-btn').forEach(updateRingDOM));
        });
    } else {
        scanAndMount();
        fetchStats().then(() => document.querySelectorAll('.agy-token-ring-btn').forEach(updateRingDOM));
    }
})();
