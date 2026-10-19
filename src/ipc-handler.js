/**
 * Antigravity Token Ring - Main Process IPC Handler
 * 
 * Runs in Electron's Main Process (Node.js runtime).
 * Reads the latest active session transcript in ~/.gemini/antigravity/brain
 * and returns token usage, cache hit rate, and estimated costs.
 */

function registerTokenRingIpc(electron) {
    electron.ipcMain.handle('antigravity:get-token-stats', async () => {
        try {
            const fs = require('node:fs');
            const path = require('node:path');
            const os = require('node:os');

            const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
            if (!fs.existsSync(brainDir)) {
                return { success: false, reason: 'Brain directory not found' };
            }

            // Find all conversation directories
            const dirs = fs.readdirSync(brainDir)
                .map(d => ({ name: d, full: path.join(brainDir, d) }))
                .filter(d => {
                    try {
                        return fs.statSync(d.full).isDirectory() && !d.name.startsWith('.');
                    } catch (e) {
                        return false;
                    }
                });

            if (dirs.length === 0) {
                return { success: false, reason: 'No conversation sessions found' };
            }

            // Sort by modification time to find the active conversation
            dirs.sort((a, b) => fs.statSync(b.full).mtimeMs - fs.statSync(a.full).mtimeMs);
            const activeDir = dirs[0];
            const logFile = path.join(activeDir.full, '.system_generated', 'logs', 'transcript.jsonl');

            if (!fs.existsSync(logFile)) {
                return { success: false, reason: 'Transcript log file not found' };
            }

            const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
            let latestContext = 0;
            let sessionInput = 0;
            let sessionHit = 0;
            let sessionOut = 0;
            let sessionCalls = 0;

            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            let todayTokens = 0;

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const ev = JSON.parse(line);
                    if (ev.type === 'PLANNER_RESPONSE' && ev.source === 'MODEL') {
                        const inp = ev.input_tokens || 0;
                        const hit = ev.cache_read_tokens || 0;
                        const out = ev.output_tokens || 0;

                        sessionInput += inp;
                        sessionHit += hit;
                        sessionOut += out;
                        sessionCalls += 1;
                        latestContext = inp + hit + out;

                        if (ev.created_at) {
                            const t = new Date(ev.created_at).getTime();
                            if (t >= startOfDay) {
                                todayTokens += (inp + hit + out);
                            }
                        }
                    }
                } catch (e) {
                    // Ignore malformed json lines
                }
            }

            const totalInput = sessionInput + sessionHit;
            const hitRate = totalInput > 0 ? (sessionHit / totalInput * 100) : 0;

            // Standard benchmark pricing: USD / 1M tokens
            const PRICING = { hit: 0.0375, miss: 0.15, out: 0.60 };
            const USD_TO_CNY = 7.23;

            const costUsd = ((sessionInput / 1e6) * PRICING.miss) +
                            ((sessionHit / 1e6) * PRICING.hit) +
                            ((sessionOut / 1e6) * PRICING.out);
            const costCny = costUsd * USD_TO_CNY;

            return {
                success: true,
                context: latestContext,
                hitRate: hitRate.toFixed(1),
                sessionInput,
                sessionHit,
                sessionOut,
                calls: sessionCalls,
                costUsd: costUsd.toFixed(4),
                costCny: costCny.toFixed(2),
                todayTokens
            };
        } catch (err) {
            return { success: false, reason: String(err) };
        }
    });
}

module.exports = { registerTokenRingIpc };
