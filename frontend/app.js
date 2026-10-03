/**
 * NEURORUSH — CLIENT FRONTEND ENGINE (PHASE 14 PRODUCTION PATCH)
 * Pure vanilla JavaScript consuming live Node.js / MySQL backend APIs.
 * Architecture Enforcement: Presentation, UX, and Light Theme Refinement only.
 */

const API_BASE = (window.REACT_APP_API_URL && window.REACT_APP_API_URL.trim() !== '')
    ? window.REACT_APP_API_URL.replace(/\/$/, '')
    : window.location.origin;

// Application State
const state = {
    token: localStorage.getItem('neurorush_token') || null,
    user: null,
    currentView: 'home',
    activeChallenge: null,
    challengeRunning: null, // 'memory' | 'reflex' | 'attention' | 'typing' | null
    typingAwaitingNext: false,
    memoryUserSequence: [],
    memoryDisplayTimeout: null,
    typingStartTime: null,
    reflexStartTime: null,
    reflexDelayTimeout: null,
    lbCategory: 'global',
    lbPage: 1,
    lbTotalPages: 1
};

// ================= API UTILITIES =================
async function apiRequest(endpoint, method = 'GET', data = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }

    const options = { method, headers };
    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        const json = await response.json();
        return { status: response.status, ok: response.ok, data: json };
    } catch (err) {
        console.error(`API Error on ${endpoint}:`, err);
        return { status: 500, ok: false, data: { message: 'Network connection failed.' } };
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    if (type === 'error') toast.style.borderLeftColor = 'var(--accent-rose)';
    if (type === 'success') toast.style.borderLeftColor = 'var(--accent-emerald)';
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ================= CHALLENGE LOCK & CONFIRMATION MODAL (PHASE 3) =================
let confirmActionCallback = null;

function lockChallengeSession(skill) {
    state.challengeRunning = skill;
    document.body.classList.add('challenge-locked');
    document.querySelectorAll('.btn-exit-chal').forEach(b => b.classList.add('hidden'));
    const exitBtn = document.getElementById(`btn-exit-${skill}`);
    if (exitBtn) exitBtn.classList.remove('hidden');
}

function unlockChallengeSession() {
    state.challengeRunning = null;
    document.body.classList.remove('challenge-locked');
    document.querySelectorAll('.btn-exit-chal').forEach(b => b.classList.add('hidden'));
}

function showConfirmModal({ title, message, badge = 'CONFIRM ACTION', confirmText = 'Confirm', cancelText = 'Cancel', confirmClass = 'btn-primary', onConfirm }) {
    const modal = document.getElementById('app-confirm-modal');
    if (!modal) return;

    const badgeEl = document.getElementById('confirm-modal-badge');
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const cancelBtn = document.getElementById('btn-confirm-cancel');
    const acceptBtn = document.getElementById('btn-confirm-accept');

    if (badgeEl) badgeEl.textContent = badge;
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    if (cancelBtn) {
        cancelBtn.textContent = cancelText;
        cancelBtn.onclick = closeConfirmModal;
    }
    if (acceptBtn) {
        acceptBtn.textContent = confirmText;
        acceptBtn.className = `btn ${confirmClass}`;
        acceptBtn.onclick = () => {
            if (typeof confirmActionCallback === 'function') {
                const cb = confirmActionCallback;
                closeConfirmModal();
                cb();
            } else {
                closeConfirmModal();
            }
        };
    }

    confirmActionCallback = onConfirm;
    modal.classList.remove('hidden');
}

function closeConfirmModal() {
    const modal = document.getElementById('app-confirm-modal');
    if (modal) modal.classList.add('hidden');
    confirmActionCallback = null;
}

function confirmExitChallenge(skill) {
    showConfirmModal({
        badge: 'EXIT CHALLENGE',
        title: 'Are you sure you want to leave this challenge?',
        message: 'Your current session will be discarded completely. No points will be deducted, and your level progression will not be affected.',
        confirmText: 'Exit Challenge',
        cancelText: 'Continue Challenge',
        confirmClass: 'btn-outline-danger',
        onConfirm: () => {
            discardCurrentChallenge();
        }
    });
}

function discardCurrentChallenge() {
    // 1. Memory Discard
    if (state.memoryDisplayTimeout) clearTimeout(state.memoryDisplayTimeout);
    state.memoryUserSequence = [];
    updateMemorySequencePreview();
    const memArea = document.getElementById('memory-pattern-area');
    if (memArea) memArea.innerHTML = '<div class="pattern-placeholder">Session exited. Click Start Challenge to begin.</div>';
    const memInput = document.getElementById('memory-input-area');
    if (memInput) memInput.classList.add('hidden');
    const memFooter = document.getElementById('memory-footer');
    if (memFooter) memFooter.classList.remove('hidden');

    // 2. Reflex Discard
    if (state.reflexDelayTimeout) clearTimeout(state.reflexDelayTimeout);
    reflexState = 'IDLE';
    reflexChallengeData = null;
    const refBox = document.getElementById('reflex-trigger-box');
    const refLabel = document.getElementById('reflex-trigger-text');
    if (refBox) refBox.className = 'reflex-trigger-box state-idle';
    if (refLabel) refLabel.textContent = 'Session exited. Click Start to arm trigger.';

    // 3. Attention Discard
    activeAttentionData = null;
    const attHint = document.getElementById('attention-target-hint');
    if (attHint) attHint.classList.add('hidden');
    const attWrap = document.getElementById('attention-grid-wrapper');
    if (attWrap) attWrap.innerHTML = '<div class="pattern-placeholder">Session exited. Click Start Challenge to begin.</div>';

    // 4. Typing Discard
    activeTypingData = null;
    state.typingStartTime = null;
    state.typingAwaitingNext = false;
    const typingArea = document.getElementById('typing-textarea');
    if (typingArea) {
        typingArea.value = '';
        typingArea.disabled = true;
    }
    const typingPassage = document.getElementById('typing-target-passage');
    if (typingPassage) typingPassage.textContent = "Session exited. Click 'Generate Passage' to receive your typing prompt.";
    const typingSubmitBtn = document.getElementById('btn-typing-submit');
    if (typingSubmitBtn) typingSubmitBtn.classList.add('hidden');
    const typingStartBtn = document.getElementById('btn-typing-start');
    if (typingStartBtn) {
        typingStartBtn.textContent = 'Generate Passage';
        typingStartBtn.classList.remove('hidden');
    }
    const typingResetBtn = document.getElementById('btn-typing-reset');
    if (typingResetBtn) typingResetBtn.classList.add('hidden');
    const typingLive = document.getElementById('typing-stats-live');
    if (typingLive) typingLive.textContent = 'WPM: 0 | Accuracy: 100%';

    state.activeChallenge = null;
    unlockChallengeSession();
    showToast('Challenge session discarded. No score or attempts recorded.', 'info');
}

function confirmResetIndividualSkill(skillType) {
    const title = skillType.charAt(0).toUpperCase() + skillType.slice(1).toLowerCase();
    showConfirmModal({
        badge: 'RESET CHALLENGE',
        title: `Reset ${title} Challenge?`,
        message: `This will permanently delete your level, highest level, statistics, history, scores, accuracy, and speed metrics for ${title} ONLY. You will restart from Level 1. Continue?`,
        confirmText: `Reset ${title}`,
        cancelText: 'Cancel',
        confirmClass: 'btn-outline-danger',
        onConfirm: async () => {
            const res = await apiRequest('/api/progression/reset', 'POST', { skill_type: skillType });
            if (res.ok && res.data.success) {
                discardCurrentChallenge();
                showToast(`${title} challenge successfully reset to Level 1.`, 'success');
                loadOperativeData();
                loadProfileView();
                loadDashboardView();
            } else {
                showToast(res.data?.message || `Failed to reset ${title} progression.`, 'error');
            }
        }
    });
}

function confirmResetAllProgress() {
    showConfirmModal({
        badge: 'GLOBAL ACCOUNT RESET',
        title: 'Reset All Challenges?',
        message: 'This action will erase all NeuroRush progress. Continue?',
        confirmText: 'Reset All Challenges',
        cancelText: 'Cancel',
        confirmClass: 'btn-outline-danger',
        onConfirm: async () => {
            const res = await apiRequest('/api/progression/reset-all', 'POST');
            if (res.ok && res.data.success) {
                discardCurrentChallenge();
                showToast('All NeuroRush progress erased. Account restarted completely from Level 1.', 'success');
                loadOperativeData();
                loadProfileView();
                loadDashboardView();
            } else {
                showToast(res.data?.message || 'Failed to execute global reset.', 'error');
            }
        }
    });
}

// ================= NAVIGATION ROUTER =================
function navigateTo(viewId) {
    // Challenge Lock Enforcement (Issue 1)
    if (state.challengeRunning) {
        showToast('Challenge in progress! Please complete the session or use "Exit Challenge".', 'error');
        return;
    }

    // Achievements page consolidated into Profile (Issue 3)
    if (viewId === 'achievements') {
        viewId = 'profile';
    }

    if (['dashboard', 'challenges', 'analytics', 'leaderboard', 'profile'].includes(viewId) && !state.token) {
        showToast('Please sign in to access your operative dashboard.', 'info');
        viewId = 'auth';
    }

    state.currentView = viewId;

    // Update View Containers
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(`view-${viewId}`);
    if (target) target.classList.add('active');

    // Update Nav Links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.view === viewId);
    });

    // Close mobile menu if open
    const navLinks = document.getElementById('nav-links');
    if (navLinks) navLinks.classList.remove('open');

    // Trigger View Loaders
    if (viewId === 'dashboard') loadDashboardView();
    if (viewId === 'analytics') loadAnalyticsView();
    if (viewId === 'leaderboard') loadLeaderboardView();
    if (viewId === 'profile') loadProfileView();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateNavAuthUI() {
    const slot = document.getElementById('nav-auth-slot');
    if (!slot) return;
    if (state.token && state.user) {
        slot.innerHTML = `
            <div class="user-pill">
                <span style="cursor:pointer; font-weight:600; font-size:0.85rem; color:var(--text-primary);" onclick="navigateTo('profile')">👤 ${state.user.username}</span>
                <button class="btn btn-outline btn-sm" onclick="handleLogout()">Logout</button>
            </div>
        `;
    } else {
        slot.innerHTML = `
            <button class="btn btn-primary btn-sm" onclick="navigateTo('auth')">Sign In</button>
        `;
    }
}

// ================= AUTHENTICATION (ISSUE 2) =================
async function checkAuthSession() {
    if (!state.token) {
        updateNavAuthUI();
        return;
    }
    const res = await apiRequest('/api/auth/me');
    if (res.ok && res.data.success) {
        state.user = res.data;
        updateNavAuthUI();
    } else {
        handleLogout();
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const statusEl = document.getElementById('login-status');

    statusEl.innerHTML = '<span class="text-muted">Authenticating...</span>';
    const res = await apiRequest('/api/auth/login', 'POST', { email, password });

    if (res.ok && res.data.success) {
        state.token = res.data.token;
        state.user = { user_id: res.data.user_id, username: res.data.username, email: res.data.email };
        localStorage.setItem('neurorush_token', state.token);
        updateNavAuthUI();
        showToast(`Welcome back, ${state.user.username}!`, 'success');
        navigateTo('dashboard');
    } else {
        statusEl.innerHTML = `<span class="status-error">${res.data.message || 'Login failed.'}</span>`;
    }
}

async function handleRegisterSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const statusEl = document.getElementById('register-status');

    statusEl.innerHTML = '<span class="text-muted">Registering user...</span>';
    const res = await apiRequest('/api/auth/register', 'POST', { username, email, password });

    if (res.ok && res.data.success) {
        showToast('Registration successful! Logging in...', 'success');
        const loginRes = await apiRequest('/api/auth/login', 'POST', { email, password });
        if (loginRes.ok) {
            state.token = loginRes.data.token;
            state.user = { user_id: loginRes.data.user_id, username: loginRes.data.username, email: loginRes.data.email };
            localStorage.setItem('neurorush_token', state.token);
            updateNavAuthUI();
            navigateTo('dashboard');
        }
    } else {
        statusEl.innerHTML = `<span class="status-error">${res.data.message || 'Registration failed.'}</span>`;
    }
}

function handleLogout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('neurorush_token');
    updateNavAuthUI();
    showToast('Signed out successfully.', 'info');
    navigateTo('home');
}

// Fixed Toggle: Guarantees exactly one form is visible at any given time (Issue 2)
function switchAuthTab(mode) {
    const tabLogin = document.getElementById('tab-login');
    const tabReg = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formReg = document.getElementById('form-register');
    const loginStatus = document.getElementById('login-status');
    const regStatus = document.getElementById('register-status');

    if (loginStatus) loginStatus.innerHTML = '';
    if (regStatus) regStatus.innerHTML = '';

    if (mode === 'login') {
        tabLogin.classList.add('active');
        tabReg.classList.remove('active');
        formLogin.classList.remove('hidden');
        formReg.classList.add('hidden');
        formLogin.style.display = 'block';
        formReg.style.display = 'none';
    } else {
        tabReg.classList.add('active');
        tabLogin.classList.remove('active');
        formReg.classList.remove('hidden');
        formLogin.classList.add('hidden');
        formReg.style.display = 'block';
        formLogin.style.display = 'none';
    }
}

// ================= DASHBOARD LOADER =================
async function loadDashboardView() {
    const [overviewRes, dashRes, adaptiveRes, lbRes, skillsRes] = await Promise.all([
        apiRequest('/api/analytics/overview'),
        apiRequest('/api/profile/dashboard'),
        apiRequest('/api/adaptive/status'),
        apiRequest('/api/leaderboard/global?limit=100'),
        apiRequest('/api/analytics/skills')
    ]);

    let progLevels = { memory_level: 1, reflex_level: 1, attention_level: 1, typing_level: 1 };
    let skillScores = { MEMORY: 0, REFLEX: 0, ATTENTION: 0, TYPING: 0 };

    if (overviewRes.ok && overviewRes.data.success) {
        const d = overviewRes.data;
        document.getElementById('dash-total-sessions').textContent = d.total_sessions;
        document.getElementById('dash-best-score').textContent = d.highest_session_score;
        document.getElementById('dash-avg-score').textContent = d.average_score;
        document.getElementById('dash-best-skill').textContent = d.best_skill || 'Evaluating...';
        document.getElementById('dash-weak-skill').textContent = d.weakest_skill || 'Evaluating...';

        // Progression Bars
        progLevels = d.current_progression || progLevels;
        const progBarsContainer = document.getElementById('dash-progression-bars');
        progBarsContainer.innerHTML = `
            ${renderProgBar('Memory', progLevels.memory_level)}
            ${renderProgBar('Reflex', progLevels.reflex_level)}
            ${renderProgBar('Attention', progLevels.attention_level)}
            ${renderProgBar('Typing', progLevels.typing_level)}
        `;
    }

    if (skillsRes.ok && skillsRes.data.success && skillsRes.data.skills) {
        const sk = skillsRes.data.skills;
        skillScores = {
            MEMORY: sk.MEMORY?.highest_score || (progLevels.memory_level * 20),
            REFLEX: sk.REFLEX?.highest_score || (progLevels.reflex_level * 20),
            ATTENTION: sk.ATTENTION?.highest_score || (progLevels.attention_level * 20),
            TYPING: sk.TYPING?.highest_score || (progLevels.typing_level * 20)
        };
    } else {
        skillScores = {
            MEMORY: progLevels.memory_level * 20,
            REFLEX: progLevels.reflex_level * 20,
            ATTENTION: progLevels.attention_level * 20,
            TYPING: progLevels.typing_level * 20
        };
    }

    // Render Light Theme Native SVG Domain Comparison Radar Chart
    renderDashboardRadar(skillScores);

    // Adaptive Difficulty Display
    if (adaptiveRes.ok && adaptiveRes.data.success) {
        const diffs = adaptiveRes.data.difficulties;
        const diffGrid = document.getElementById('dash-difficulty-grid');
        diffGrid.innerHTML = `
            <div class="diff-chip"><span class="diff-chip-name">🧠 Memory</span><span class="badge">${diffs.memory_difficulty}</span></div>
            <div class="diff-chip"><span class="diff-chip-name">⚡ Reflex</span><span class="badge">${diffs.reflex_difficulty}</span></div>
            <div class="diff-chip"><span class="diff-chip-name">🎯 Attention</span><span class="badge">${diffs.attention_difficulty}</span></div>
            <div class="diff-chip"><span class="diff-chip-name">⌨️ Typing</span><span class="badge">${diffs.typing_difficulty}</span></div>
        `;
    }

    // Leaderboard Position
    if (lbRes.ok && lbRes.data.success && state.user) {
        const myEntry = lbRes.data.leaderboard.find(e => e.username === state.user.username);
        document.getElementById('dash-global-rank').textContent = myEntry ? `#${myEntry.rank}` : 'Unranked';
    }

    // Recent Sessions
    if (dashRes.ok && dashRes.data.success) {
        const recent = dashRes.data.recent_sessions || [];
        const container = document.getElementById('dash-recent-sessions');
        if (recent.length === 0) {
            container.innerHTML = '<p class="text-muted" style="font-size:0.88rem; padding: 0.5rem 0;">No sessions completed yet. Launch your first session above!</p>';
        } else {
            container.innerHTML = recent.map(s => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.55rem 0; border-bottom:1px solid #F1F5F9; font-size:0.88rem;">
                    <span>${new Date(s.session_date).toLocaleDateString()} ${new Date(s.session_date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    <strong class="gradient-text">${s.overall_score} pts</strong>
                </div>
            `).join('');
        }
    }
}

function renderProgBar(label, level) {
    const pct = Math.min(100, Math.max(15, level * 25));
    return `
        <div>
            <div class="prog-item-header">
                <span>${label}</span>
                <span class="badge badge-info">Level ${level}</span>
            </div>
            <div class="prog-track">
                <div class="prog-fill" style="width: ${pct}%;"></div>
            </div>
        </div>
    `;
}

// Render Advanced Futuristic Neural Performance Graph (Phase 3 Redesign)
function renderDashboardRadar(scores) {
    const container = document.getElementById('dash-visual-chart');
    if (!container) return;

    const maxVal = 100;
    const memVal = Math.min(maxVal, Math.max(5, scores.MEMORY || 20));
    const refVal = Math.min(maxVal, Math.max(5, scores.REFLEX || 20));
    const attVal = Math.min(maxVal, Math.max(5, scores.ATTENTION || 20));
    const typVal = Math.min(maxVal, Math.max(5, scores.TYPING || 20));

    const cx = 220;
    const cy = 120;
    const R = 85;

    // 4 Coordinate Poles: Top (Memory), Right (Reflex), Bottom (Attention), Left (Typing)
    const pMem = { x: cx, y: cy - (memVal / maxVal) * R };
    const pRef = { x: cx + (refVal / maxVal) * R, y: cy };
    const pAtt = { x: cx, y: cy + (attVal / maxVal) * R };
    const pTyp = { x: cx - (typVal / maxVal) * R, y: cy };

    const compositeScore = Math.round((memVal + refVal + attVal + typVal) / 4);
    const pathData = `M ${pMem.x} ${pMem.y} L ${pRef.x} ${pRef.y} L ${pAtt.x} ${pAtt.y} L ${pTyp.x} ${pTyp.y} Z`;

    const svg = `
        <div class="neural-radar-container">
            <svg viewBox="0 0 440 240" width="100%" height="240" class="neural-radar-svg">
                <defs>
                    <!-- Holographic Gradients -->
                    <radialGradient id="neuralAura" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stop-color="#00B5FF" stop-opacity="0.18" />
                        <stop offset="60%" stop-color="#6366F1" stop-opacity="0.06" />
                        <stop offset="100%" stop-color="#0F172A" stop-opacity="0.0" />
                    </radialGradient>
                    <linearGradient id="neuralPolyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#00B5FF" stop-opacity="0.45" />
                        <stop offset="50%" stop-color="#6366F1" stop-opacity="0.30" />
                        <stop offset="100%" stop-color="#10B981" stop-opacity="0.25" />
                    </linearGradient>
                    <linearGradient id="polyStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#00B5FF" />
                        <stop offset="50%" stop-color="#818CF8" />
                        <stop offset="100%" stop-color="#10B981" />
                    </linearGradient>
                    <filter id="neonBeaconGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>

                <!-- Background Holographic Aura -->
                <circle cx="${cx}" cy="${cy}" r="${R + 15}" fill="url(#neuralAura)" />

                <!-- Circular & Polygonal Neural Grid Web -->
                <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#E2E8F0" stroke-width="1.5" />
                <circle cx="${cx}" cy="${cy}" r="${R * 0.75}" fill="none" stroke="#E2E8F0" stroke-dasharray="3,3" />
                <circle cx="${cx}" cy="${cy}" r="${R * 0.5}" fill="none" stroke="#E2E8F0" stroke-dasharray="2,2" />
                <circle cx="${cx}" cy="${cy}" r="${R * 0.25}" fill="none" stroke="#CBD5E1" stroke-dasharray="1,2" />

                <!-- Diamond Radial Lattice -->
                <polygon points="${cx},${cy - R} ${cx + R},${cy} ${cx},${cy + R} ${cx - R},${cy}" fill="none" stroke="#94A3B8" stroke-width="1" stroke-opacity="0.5" />
                <polygon points="${cx},${cy - R*0.5} ${cx + R*0.5},${cy} ${cx},${cy + R*0.5} ${cx - R*0.5},${cy}" fill="none" stroke="#CBD5E1" stroke-dasharray="2,2" stroke-opacity="0.6" />

                <!-- Diagonal Synaptic Ray Guides -->
                <line x1="${cx - R*0.7}" y1="${cy - R*0.7}" x2="${cx + R*0.7}" y2="${cy + R*0.7}" stroke="#E2E8F0" stroke-dasharray="1,4" />
                <line x1="${cx - R*0.7}" y1="${cy + R*0.7}" x2="${cx + R*0.7}" y2="${cy - R*0.7}" stroke="#E2E8F0" stroke-dasharray="1,4" />

                <!-- Cardinal Coordinate Axes -->
                <line x1="${cx - R - 12}" y1="${cy}" x2="${cx + R + 12}" y2="${cy}" stroke="#CBD5E1" stroke-width="1.2" />
                <line x1="${cx}" y1="${cy - R - 12}" x2="${cx}" y2="${cy + R + 12}" stroke="#CBD5E1" stroke-width="1.2" />

                <!-- Center Neural Core Badge -->
                <circle cx="${cx}" cy="${cy}" r="12" fill="#0F172A" />
                <circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="#38BDF8" stroke-width="1.5" stroke-opacity="0.6" />
                <text x="${cx}" y="${cy + 3.5}" text-anchor="middle" fill="#38BDF8" font-size="9" font-weight="900" font-family="'JetBrains Mono', monospace">${compositeScore}</text>

                <!-- Data Polygon Mesh (Backdrop Shadow + Foreground) -->
                <path d="${pathData}" fill="url(#neuralPolyGrad)" stroke="url(#polyStrokeGrad)" stroke-width="2.5" filter="url(#neonBeaconGlow)" />

                <!-- Synaptic Connection Web Lines -->
                <line x1="${cx}" y1="${cy}" x2="${pMem.x}" y2="${pMem.y}" stroke="#00B5FF" stroke-width="1" stroke-opacity="0.7" />
                <line x1="${cx}" y1="${cy}" x2="${pRef.x}" y2="${pRef.y}" stroke="#10B981" stroke-width="1" stroke-opacity="0.7" />
                <line x1="${cx}" y1="${cy}" x2="${pAtt.x}" y2="${pAtt.y}" stroke="#6366F1" stroke-width="1" stroke-opacity="0.7" />
                <line x1="${cx}" y1="${cy}" x2="${pTyp.x}" y2="${pTyp.y}" stroke="#F59E0B" stroke-width="1" stroke-opacity="0.7" />

                <!-- Active Neural Node Beacons -->
                <!-- Memory Node -->
                <circle cx="${pMem.x}" cy="${pMem.y}" r="7" fill="none" stroke="#00B5FF" stroke-width="1.5" stroke-opacity="0.5" />
                <circle cx="${pMem.x}" cy="${pMem.y}" r="4.5" fill="#00B5FF" stroke="#FFFFFF" stroke-width="2" />
                <!-- Reflex Node -->
                <circle cx="${pRef.x}" cy="${pRef.y}" r="7" fill="none" stroke="#10B981" stroke-width="1.5" stroke-opacity="0.5" />
                <circle cx="${pRef.x}" cy="${pRef.y}" r="4.5" fill="#10B981" stroke="#FFFFFF" stroke-width="2" />
                <!-- Attention Node -->
                <circle cx="${pAtt.x}" cy="${pAtt.y}" r="7" fill="none" stroke="#6366F1" stroke-width="1.5" stroke-opacity="0.5" />
                <circle cx="${pAtt.x}" cy="${pAtt.y}" r="4.5" fill="#6366F1" stroke="#FFFFFF" stroke-width="2" />
                <!-- Typing Node -->
                <circle cx="${pTyp.x}" cy="${pTyp.y}" r="7" fill="none" stroke="#F59E0B" stroke-width="1.5" stroke-opacity="0.5" />
                <circle cx="${pTyp.x}" cy="${pTyp.y}" r="4.5" fill="#F59E0B" stroke="#FFFFFF" stroke-width="2" />

                <!-- Modern Neon Domain Telemetry Labels -->
                <text x="${cx}" y="${cy - R - 16}" text-anchor="middle" fill="#0284C7" font-size="11" font-weight="800" font-family="'JetBrains Mono', monospace">MEMORY • ${memVal}%</text>
                <text x="${cx + R + 18}" y="${cy + 4}" text-anchor="start" fill="#059669" font-size="11" font-weight="800" font-family="'JetBrains Mono', monospace">REFLEX • ${refVal}%</text>
                <text x="${cx}" y="${cy + R + 22}" text-anchor="middle" fill="#4F46E5" font-size="11" font-weight="800" font-family="'JetBrains Mono', monospace">ATTENTION • ${attVal}%</text>
                <text x="${cx - R - 18}" y="${cy + 4}" text-anchor="end" fill="#D97706" font-size="11" font-weight="800" font-family="'JetBrains Mono', monospace">TYPING • ${typVal}%</text>
            </svg>
        </div>
    `;

    container.innerHTML = svg;
}

// ================= CHALLENGE INTERACTION =================
function handleStartSession() {
    navigateTo('challenges');
    switchChallengeTab('memory');
}

function handleDirectChallenge(skill) {
    navigateTo('challenges');
    switchChallengeTab(skill);
}

function switchChallengeTab(tabName) {
    if (state.challengeRunning && state.challengeRunning !== tabName) {
        showToast('Challenge in progress! Please complete the session or use "Exit Challenge".', 'error');
        return;
    }

    document.querySelectorAll('#challenge-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.challenge === tabName);
    });

    ['memory', 'reflex', 'attention', 'typing'].forEach(c => {
        const el = document.getElementById(`canvas-${c}`);
        if (el) el.classList.toggle('hidden', c !== tabName);
    });
}

function showResultModal(title, score, breakdownItems) {
    const modal = document.getElementById('challenge-result-modal');
    document.getElementById('result-badge').textContent = title;
    document.getElementById('result-score').textContent = `${score} PTS`;

    const breakdownContainer = document.getElementById('result-breakdown');
    breakdownContainer.innerHTML = breakdownItems.map(item => `
        <div class="breakdown-item">
            <span class="text-muted" style="display:block; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em;">${item.label}</span>
            <strong style="font-size:0.95rem; color:var(--text-primary);">${item.value}</strong>
        </div>
    `).join('');

    modal.classList.remove('hidden');
}

function closeResultModal() {
    document.getElementById('challenge-result-modal').classList.add('hidden');
}

function handleReplayCurrentChallenge() {
    closeResultModal();
    const currentTab = document.querySelector('#challenge-tabs .tab-btn.active')?.dataset.challenge || 'memory';
    if (currentTab === 'memory') startMemoryChallenge();
    else if (currentTab === 'reflex') armReflexTrigger();
    else if (currentTab === 'attention') startAttentionChallenge();
    else if (currentTab === 'typing') startTypingChallenge();
}

// --- 1. Memory Challenge (Issues 6, 7, 8) ---
async function startMemoryChallenge() {
    // Reset any previous sequence before starting (Item 11)
    state.memoryUserSequence = [];
    updateMemorySequencePreview();

    const res = await apiRequest('/api/memory/challenge');
    if (!res.ok) {
        showToast('Failed to start memory challenge.', 'error');
        return;
    }

    const { challenge_id, pattern, display_time_ms, options, difficulty } = res.data;
    state.activeChallenge = { type: 'memory', id: challenge_id, pattern, startTime: Date.now() };

    lockChallengeSession('memory');

    document.getElementById('memory-difficulty-badge').textContent = `DIFFICULTY: ${difficulty || 'MEDIUM'}`;
    document.getElementById('memory-footer').classList.add('hidden');
    document.getElementById('memory-input-area').classList.add('hidden');

    const area = document.getElementById('memory-pattern-area');
    area.innerHTML = pattern.map(color => `<div class="pattern-circle color-${color}"></div>`).join('');

    // Setup input palette buttons
    const paletteRow = document.getElementById('memory-palette-buttons');
    paletteRow.innerHTML = options.map(c => `
        <button class="btn-palette color-${c}" onclick="addMemoryColor('${c}')" aria-label="${c}"></button>
    `).join('');

    // Hide pattern after display_time_ms
    if (state.memoryDisplayTimeout) clearTimeout(state.memoryDisplayTimeout);
    state.memoryDisplayTimeout = setTimeout(() => {
        area.innerHTML = '<div class="pattern-placeholder">Pattern hidden! Enter the sequence below.</div>';
        document.getElementById('memory-input-area').classList.remove('hidden');
    }, display_time_ms);
}

function addMemoryColor(color) {
    state.memoryUserSequence.push(color);
    updateMemorySequencePreview();
}

// Undo Last Button: Removes only the most recently selected color (Item 11)
function undoMemoryColor() {
    if (state.memoryUserSequence && state.memoryUserSequence.length > 0) {
        state.memoryUserSequence.pop();
        updateMemorySequencePreview();
    }
}

// Clear All Button: Resets the entire sequence input
function resetMemoryInput() {
    state.memoryUserSequence = [];
    updateMemorySequencePreview();
}

function updateMemorySequencePreview() {
    const preview = document.getElementById('memory-sequence-preview');
    if (!preview) return;
    preview.innerHTML = state.memoryUserSequence.map(c => `<div class="preview-circle color-${c}"></div>`).join('');
}

// Submit Recall: Submits and immediately resets sequence indicators (Item 11)
async function submitMemoryAnswer() {
    if (!state.activeChallenge || state.activeChallenge.type !== 'memory') return;
    const timeTaken = (Date.now() - state.activeChallenge.startTime) / 1000;
    const submittedSequence = [...state.memoryUserSequence];

    // Immediately clear selected circles, sequence preview, temporary memory buffer before next level starts
    state.memoryUserSequence = [];
    updateMemorySequencePreview();
    unlockChallengeSession();

    const res = await apiRequest('/api/memory/submit', 'POST', {
        challenge_id: state.activeChallenge.id,
        user_answer: submittedSequence,
        time_taken: timeTaken
    });

    document.getElementById('memory-input-area').classList.add('hidden');
    document.getElementById('memory-footer').classList.remove('hidden');
    document.getElementById('memory-pattern-area').innerHTML = '<div class="pattern-placeholder">Challenge finished. Click below to start next level.</div>';

    if (res.ok && res.data.success) {
        showResultModal('MEMORY CHALLENGE COMPLETE', res.data.score, [
            { label: 'Recall Accuracy', value: `${res.data.accuracy}%` },
            { label: 'Time Elapsed', value: `${timeTaken.toFixed(2)}s` },
            { label: 'Domain', value: 'Pattern Memory' },
            { label: 'Session Status', value: 'Saved' }
        ]);
        apiRequest('/api/adaptive/evaluate', 'POST', { skill_type: 'MEMORY' });
        apiRequest('/api/progression/evaluate', 'POST', { skill_type: 'MEMORY' });
    } else {
        showToast(res.data.message || 'Submission failed.', 'error');
    }
}

// --- 2. Reflex Challenge ---
let reflexState = 'IDLE'; // 'IDLE', 'WAITING', 'TRIGGERED'
let reflexChallengeData = null;

async function armReflexTrigger() {
    const chalRes = await apiRequest('/api/reflex/challenge');
    if (!chalRes.ok) {
        showToast('Failed to initialize reflex challenge.', 'error');
        return;
    }

    const { challenge_id, difficulty, max_reaction_time_ms } = chalRes.data;
    document.getElementById('reflex-difficulty-badge').textContent = `DIFFICULTY: ${difficulty || 'MEDIUM'}`;
    document.getElementById('reflex-timeout-badge').textContent = `Window: ${max_reaction_time_ms}ms`;

    const startRes = await apiRequest('/api/reflex/start', 'POST', { challenge_id });
    if (!startRes.ok) {
        showToast('Failed to start trigger delay.', 'error');
        return;
    }

    reflexChallengeData = { id: challenge_id, maxWindow: max_reaction_time_ms };
    reflexState = 'WAITING';

    lockChallengeSession('reflex');

    const box = document.getElementById('reflex-trigger-box');
    const label = document.getElementById('reflex-trigger-text');
    box.className = 'reflex-trigger-box state-waiting';
    label.textContent = 'WAIT FOR GREEN... DO NOT CLICK!';

    const delay = startRes.data.delay_ms;
    state.reflexDelayTimeout = setTimeout(() => {
        if (reflexState === 'WAITING') {
            reflexState = 'TRIGGERED';
            state.reflexStartTime = Date.now();
            box.className = 'reflex-trigger-box state-ready';
            label.textContent = 'CLICK NOW!';
        }
    }, delay);
}

async function handleReflexBoxClick() {
    const box = document.getElementById('reflex-trigger-box');
    const label = document.getElementById('reflex-trigger-text');

    if (reflexState === 'IDLE') return;

    if (reflexState === 'WAITING') {
        clearTimeout(state.reflexDelayTimeout);
        reflexState = 'IDLE';
        unlockChallengeSession();

        box.className = 'reflex-trigger-box state-idle';
        label.textContent = 'TOO EARLY! CLICK PENALTY';

        await apiRequest('/api/reflex/submit', 'POST', {
            challenge_id: reflexChallengeData.id,
            client_reaction_time_ms: 10
        });

        showToast('Penalty! You clicked before the trigger turned green.', 'error');
        return;
    }

    if (reflexState === 'TRIGGERED') {
        const clientReactionTimeMs = Date.now() - state.reflexStartTime;
        reflexState = 'IDLE';
        unlockChallengeSession();

        box.className = 'reflex-trigger-box state-idle';
        label.textContent = `REACTION: ${clientReactionTimeMs}ms`;

        const res = await apiRequest('/api/reflex/submit', 'POST', {
            challenge_id: reflexChallengeData.id,
            client_reaction_time_ms: clientReactionTimeMs
        });

        if (res.ok && res.data.success) {
            showResultModal('REFLEX SPEED RECORDED', res.data.score, [
                { label: 'Reaction Latency', value: `${clientReactionTimeMs} ms` },
                { label: 'Accuracy', value: '100%' },
                { label: 'Domain', value: 'Motor Reflex' },
                { label: 'Session Status', value: 'Saved' }
            ]);
            apiRequest('/api/adaptive/evaluate', 'POST', { skill_type: 'REFLEX' });
            apiRequest('/api/progression/evaluate', 'POST', { skill_type: 'REFLEX' });
        } else {
            showToast(res.data.message || 'Submission failed.', 'error');
        }
    }
}

// --- 3. Attention Challenge ---
let activeAttentionData = null;

async function startAttentionChallenge() {
    const res = await apiRequest('/api/attention/challenge');
    if (!res.ok) {
        showToast('Failed to start attention challenge.', 'error');
        return;
    }

    const { challenge_id, target, distractor, grid, dimensions, difficulty } = res.data;
    activeAttentionData = { id: challenge_id, target, startTime: Date.now() };

    lockChallengeSession('attention');

    document.getElementById('attention-difficulty-badge').textContent = `DIFFICULTY: ${difficulty || 'MEDIUM'}`;
    document.getElementById('attention-dim-badge').textContent = `Grid: ${dimensions.rows}x${dimensions.cols}`;
    document.getElementById('attention-instruction-text').innerHTML = `Locate and select the target character <strong>'${target}'</strong> among distractors '${distractor}'.`;

    const hint = document.getElementById('attention-target-hint');
    const chip = document.getElementById('attention-target-chip');
    if (hint && chip) {
        chip.textContent = target;
        hint.classList.remove('hidden');
    }

    const wrapper = document.getElementById('attention-grid-wrapper');
    wrapper.innerHTML = `
        <div class="attention-grid" style="grid-template-columns: repeat(${dimensions.cols}, 1fr);">
            ${grid.map((row, r) => row.map((char, c) => `
                <button class="grid-cell-btn" onclick="handleAttentionCellClick(${r}, ${c})">${char}</button>
            `).join('')).join('')}
        </div>
    `;
}

async function handleAttentionCellClick(row, col) {
    if (!activeAttentionData) return;
    const timeTaken = (Date.now() - activeAttentionData.startTime) / 1000;
    unlockChallengeSession();

    const res = await apiRequest('/api/attention/submit', 'POST', {
        challenge_id: activeAttentionData.id,
        selected_row: row,
        selected_col: col,
        time_taken: timeTaken
    });

    const hint = document.getElementById('attention-target-hint');
    if (hint) hint.classList.add('hidden');

    document.getElementById('attention-grid-wrapper').innerHTML = '<div class="pattern-placeholder">Challenge finished. Click below to start next level.</div>';
    activeAttentionData = null;

    if (res.ok && res.data.success) {
        showResultModal('ATTENTION LEVEL COMPLETE', res.data.score, [
            { label: 'Target Selected', value: res.data.is_correct ? 'Correct' : 'Incorrect' },
            { label: 'Time Elapsed', value: `${timeTaken.toFixed(2)}s` },
            { label: 'Domain', value: 'Selective Attention' },
            { label: 'Session Status', value: 'Saved' }
        ]);
        apiRequest('/api/adaptive/evaluate', 'POST', { skill_type: 'ATTENTION' });
        apiRequest('/api/progression/evaluate', 'POST', { skill_type: 'ATTENTION' });
    } else {
        showToast(res.data.message || 'Attention submission error.', 'error');
    }
}

// --- 4. Typing Challenge (Item 10) ---
let activeTypingData = null;

async function startTypingChallenge() {
    const res = await apiRequest('/api/typing/challenge');
    if (!res.ok) {
        showToast('Failed to start typing challenge.', 'error');
        return;
    }

    const { challenge_id, paragraph, difficulty } = res.data;
    activeTypingData = { id: challenge_id, paragraph };

    lockChallengeSession('typing');

    document.getElementById('typing-difficulty-badge').textContent = `DIFFICULTY: ${difficulty || 'MEDIUM'}`;
    // Keep sentence clean for current level
    document.getElementById('typing-target-passage').textContent = paragraph;

    const textarea = document.getElementById('typing-textarea');
    textarea.value = '';
    textarea.disabled = false;
    textarea.focus();

    state.typingStartTime = null;
    document.getElementById('btn-typing-start').classList.add('hidden');
    document.getElementById('btn-typing-submit').classList.remove('hidden');
    const resetBtn = document.getElementById('btn-typing-reset');
    if (resetBtn) resetBtn.classList.remove('hidden');
    document.getElementById('typing-stats-live').textContent = 'WPM: 0 | Accuracy: 100%';
}

function resetTypingChallenge() {
    activeTypingData = null;
    state.typingStartTime = null;
    unlockChallengeSession();

    const textarea = document.getElementById('typing-textarea');
    textarea.value = '';
    textarea.disabled = true;

    document.getElementById('typing-target-passage').textContent = "Click 'Generate Passage' to receive your typing prompt.";
    document.getElementById('typing-stats-live').textContent = 'WPM: 0 | Accuracy: 100%';

    const startBtn = document.getElementById('btn-typing-start');
    startBtn.textContent = 'Generate Passage';
    startBtn.classList.remove('hidden');
    document.getElementById('btn-typing-submit').classList.add('hidden');
    const resetBtn = document.getElementById('btn-typing-reset');
    if (resetBtn) resetBtn.classList.add('hidden');
}

function handleTypingInput() {
    if (!state.typingStartTime) {
        state.typingStartTime = Date.now();
    }
    const typed = document.getElementById('typing-textarea').value;
    const elapsedMinutes = (Date.now() - state.typingStartTime) / 60000;
    const wpm = elapsedMinutes > 0 ? Math.round((typed.length / 5) / elapsedMinutes) : 0;
    document.getElementById('typing-stats-live').textContent = `WPM: ${wpm} | Typed: ${typed.length} chars`;
}

async function submitTypingChallenge() {
    if (!activeTypingData) return;
    const textarea = document.getElementById('typing-textarea');
    const typed = textarea.value;
    const duration = state.typingStartTime ? (Date.now() - state.typingStartTime) / 1000 : 5.0;

    unlockChallengeSession();

    const res = await apiRequest('/api/typing/submit', 'POST', {
        challenge_id: activeTypingData.id,
        typed_text: typed,
        time_taken: duration
    });

    if (res.ok && res.data.success) {
        // Problem 1 Fix: Keep SAME sentence visible; display Accuracy, WPM, Result without generating another sentence
        document.getElementById('typing-stats-live').textContent = `Accuracy: ${res.data.accuracy}% | WPM: ${res.data.wpm} | Result: ${res.data.score} PTS`;

        // Problem 2 Fix: Clear input box, typing buffer, previous typed text; prepare clean state for next level
        textarea.value = '';
        textarea.disabled = true;
        state.typingStartTime = null;

        // Hide submit and reset buttons
        document.getElementById('btn-typing-submit').classList.add('hidden');
        const resetBtn = document.getElementById('btn-typing-reset');
        if (resetBtn) resetBtn.classList.add('hidden');

        // New sentence appears ONLY when user clicks "Next Level"
        const startBtn = document.getElementById('btn-typing-start');
        startBtn.textContent = 'Next Level →';
        startBtn.classList.remove('hidden');

        activeTypingData = null;

        showResultModal('TYPING LEVEL COMPLETE', res.data.score, [
            { label: 'Accuracy', value: `${res.data.accuracy}%` },
            { label: 'WPM', value: `${res.data.wpm}` },
            { label: 'Time', value: `${duration.toFixed(2)}s` },
            { label: 'Result Summary', value: `${res.data.score} PTS (${res.data.errors} errors)` }
        ]);
        apiRequest('/api/adaptive/evaluate', 'POST', { skill_type: 'TYPING' });
        apiRequest('/api/progression/evaluate', 'POST', { skill_type: 'TYPING' });
    } else {
        showToast(res.data?.message || 'Typing submission error.', 'error');
    }
}

// ================= ANALYTICS LOADER =================
async function loadAnalyticsView() {
    const [skillsRes, recordsRes, historyRes] = await Promise.all([
        apiRequest('/api/analytics/skills'),
        apiRequest('/api/analytics/records'),
        apiRequest('/api/analytics/history')
    ]);

    // 1. Skill Breakdown Cards (Issue 1, Issue 2, Issue 8)
    if (skillsRes.ok && skillsRes.data.success) {
        const skills = skillsRes.data.skills;
        const container = document.getElementById('analytics-skills-grid');
        const icons = { MEMORY: '🧠', REFLEX: '⚡', ATTENTION: '🎯', TYPING: '⌨️' };

        container.innerHTML = Object.entries(skills).map(([key, data]) => {
            const imp = data.improvement || {};
            let deltaClass = 'delta-neutral';
            let deltaSign = '';
            const impPct = imp.improvement_pct !== undefined ? Number(imp.improvement_pct) : 0;
            if (impPct > 0) {
                deltaClass = 'delta-positive';
                deltaSign = '+';
            } else if (impPct < 0) {
                deltaClass = 'delta-negative';
            }

            // Skill specific rows (Issue 8)
            let specificRows = '';
            if (key === 'MEMORY') {
                specificRows = `
                    <div class="metric-row"><span class="text-muted">Best Level</span><strong>Level ${data.best_level || 1}</strong></div>
                    <div class="metric-row"><span class="text-muted">Average Level</span><strong>Level ${data.average_level || data.current_level || 1}</strong></div>
                    <div class="metric-row"><span class="text-muted">Completion Rate</span><strong>${data.completion_rate !== undefined ? `${data.completion_rate}%` : 'N/A'}</strong></div>
                `;
            } else if (key === 'TYPING') {
                specificRows = `
                    <div class="metric-row"><span class="text-muted">Typing Speed</span><strong>${data.wpm !== undefined ? `${data.wpm} WPM` : 'N/A'}</strong></div>
                    <div class="metric-row"><span class="text-muted">Typing Accuracy</span><strong>${data.accuracy !== undefined ? `${data.accuracy}%` : 'N/A'}</strong></div>
                    <div class="metric-row"><span class="text-muted">Best Level</span><strong>Level ${data.best_level || 1}</strong></div>
                `;
            } else if (key === 'REFLEX') {
                specificRows = `
                    <div class="metric-row"><span class="text-muted">Reaction Time</span><strong>${data.reaction_time_ms ? `${data.reaction_time_ms}ms` : 'N/A'}</strong></div>
                    <div class="metric-row"><span class="text-muted">Best Reaction</span><strong>${data.best_reaction_ms ? `${data.best_reaction_ms}ms` : 'N/A'}</strong></div>
                    <div class="metric-row"><span class="text-muted">Average Reaction</span><strong>${data.average_reaction_ms ? `${data.average_reaction_ms}ms` : 'N/A'}</strong></div>
                `;
            } else if (key === 'ATTENTION') {
                specificRows = `
                    <div class="metric-row"><span class="text-muted">Correct Selections</span><strong>${data.correct_selections !== undefined ? data.correct_selections : 'N/A'}</strong></div>
                    <div class="metric-row"><span class="text-muted">Error Count</span><strong>${data.error_count !== undefined ? data.error_count : 'N/A'}</strong></div>
                    <div class="metric-row"><span class="text-muted">Completion %</span><strong>${data.completion_pct !== undefined ? `${data.completion_pct}%` : 'N/A'}</strong></div>
                `;
            }

            const trend = imp.recent_performance_trend || {};
            const trendText = trend.direction ? `${trend.direction} (${trend.difference >= 0 ? '+' : ''}${trend.difference} pts)` : 'STABLE';

            return `
                <div class="analytics-skill-card">
                    <h3><span>${icons[key] || ''} ${key}</span><span class="badge badge-info">Levels Completed: ${data.levels_completed !== undefined ? data.levels_completed : data.total_attempts}</span></h3>
                    <div class="analytics-metrics-list">
                        <div class="metric-row"><span class="text-muted">Best Performance</span><strong>${data.highest_score} pts</strong></div>
                        <div class="metric-row"><span class="text-muted">Average Performance</span><strong>${data.average_score} pts</strong></div>
                        <div class="metric-row"><span class="text-muted">Latest Level Score</span><strong>${data.latest_score !== null ? `${data.latest_score} pts` : 'N/A'}</strong></div>
                        <div class="metric-row">
                            <span class="text-muted">Improvement %</span>
                            <span class="${deltaClass}">${deltaSign}${impPct}%</span>
                        </div>
                        <div class="metric-row">
                            <span class="text-muted">Recent Performance Trend</span>
                            <strong>${trendText}</strong>
                        </div>
                        ${specificRows}
                    </div>
                </div>
            `;
        }).join('');
    }

    // 2. Personal Records
    if (recordsRes.ok && recordsRes.data.success) {
        const rec = recordsRes.data.records;
        const container = document.getElementById('analytics-records-grid');
        container.innerHTML = `
            <div class="record-box"><div class="record-title">Best Overall Session</div><div class="record-val gradient-text">${rec.highest_overall_session_score}</div></div>
            <div class="record-box"><div class="record-title">Fastest Reflex Reaction</div><div class="record-val">${rec.fastest_reaction_time.milliseconds ? `${rec.fastest_reaction_time.milliseconds}ms` : 'N/A'}</div></div>
            <div class="record-box"><div class="record-title">Peak Memory Score</div><div class="record-val">${rec.highest_memory_score}</div></div>
            <div class="record-box"><div class="record-title">Peak Attention Score</div><div class="record-val">${rec.highest_attention_score}</div></div>
            <div class="record-box"><div class="record-title">Peak Typing Score</div><div class="record-val">${rec.highest_typing_score}</div></div>
        `;
    }

    // 3. Historical Telemetry Table (Queue DS max 15 sessions)
    if (historyRes.ok && historyRes.data.success) {
        const history = historyRes.data.session_history || [];
        const tbody = document.getElementById('analytics-history-tbody');
        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-muted" style="text-align:center;">No sessions recorded yet.</td></tr>';
        } else {
            tbody.innerHTML = history.slice(0, 15).map(s => `
                <tr>
                    <td>${new Date(s.session_date).toLocaleString()}</td>
                    <td><code class="code-badge">${s.session_id.slice(0, 8)}...</code></td>
                    <td><strong class="gradient-text">${s.overall_score} pts</strong></td>
                    <td><span class="badge badge-info">VERIFIED</span></td>
                </tr>
            `).join('');
        }
    }
}

// ================= LEADERBOARDS LOADER =================
function switchLeaderboardTab(cat) {
    state.lbCategory = cat;
    state.lbPage = 1;
    document.querySelectorAll('#leaderboard-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lb === cat);
    });
    loadLeaderboardView();
}

// Leaderboard pagination protection: never navigates past 1 or totalPages
function changeLeaderboardPage(delta) {
    const targetPage = state.lbPage + delta;
    if (targetPage < 1) return;
    if (state.lbTotalPages && targetPage > state.lbTotalPages) return;
    state.lbPage = targetPage;
    loadLeaderboardView();
}

async function loadLeaderboardView() {
    const res = await apiRequest(`/api/leaderboard/${state.lbCategory}?page=${state.lbPage}&limit=10`);
    const tbody = document.getElementById('leaderboard-tbody');
    const pageInfo = document.getElementById('lb-page-info');
    const btnPrev = document.getElementById('btn-lb-prev');
    const btnNext = document.getElementById('btn-lb-next');

    if (res.ok && res.data.success) {
        const entries = res.data.leaderboard || [];
        state.lbTotalPages = res.data.total_pages || 1;

        if (pageInfo) {
            pageInfo.textContent = `Page ${res.data.page} of ${state.lbTotalPages}`;
        }

        // Leaderboard Pagination Buttons Disabled State
        if (btnPrev) {
            btnPrev.disabled = (state.lbPage <= 1);
        }
        if (btnNext) {
            btnNext.disabled = (state.lbPage >= state.lbTotalPages);
        }

        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center;">No leaderboard entries in this category yet.</td></tr>';
            return;
        }

        tbody.innerHTML = entries.map(e => {
            const isMe = state.user && e.username === state.user.username;
            let rankBadge = `<span class="rank-pill">${e.rank}</span>`;
            if (e.rank === 1) rankBadge = `<span class="rank-pill rank-1">🥇 1</span>`;
            if (e.rank === 2) rankBadge = `<span class="rank-pill rank-2">🥈 2</span>`;
            if (e.rank === 3) rankBadge = `<span class="rank-pill rank-3">🥉 3</span>`;

            return `
                <tr style="${isMe ? 'background: #F0F9FF; border-left: 4px solid var(--accent-cyan);' : ''}">
                    <td>${rankBadge}</td>
                    <td><strong>${e.username}</strong> ${isMe ? '<span class="badge badge-info" style="margin-left:0.5rem;">YOU</span>' : ''}</td>
                    <td><span class="badge badge-info">Level ${e.level || 1}</span></td>
                    <td><strong class="gradient-text">${e.score} pts</strong></td>
                    <td>${new Date(e.achieved_at).toLocaleDateString()}</td>
                </tr>
            `;
        }).join('');
    }
}

// ================= PROFILE LOADER WITH EMBEDDED ACHIEVEMENTS (ISSUES 3 & 4) =================
async function loadProfileView() {
    const [res, histRes, achRes] = await Promise.all([
        apiRequest('/api/profile'),
        apiRequest('/api/analytics/history'),
        apiRequest('/api/achievements/progress')
    ]);

    if (res.ok && res.data.success) {
        const u = res.data;
        document.getElementById('prof-username').textContent = u.username;
        document.getElementById('prof-email').textContent = u.email;
        document.getElementById('prof-userid').textContent = u.user_id;
        document.getElementById('prof-created').textContent = new Date(u.created_at).toLocaleDateString();
        document.getElementById('prof-sessions').textContent = u.total_sessions;
        document.getElementById('prof-best').textContent = `${u.best_score} pts`;
        document.getElementById('prof-avg').textContent = `${u.avg_score} pts`;

        // Domain Progressions
        const progList = document.getElementById('prof-progressions-list');
        const prog = u.progression || {};
        progList.innerHTML = `
            ${renderProgBar('Memory Domain', prog.memory_level || 1)}
            ${renderProgBar('Reflex Domain', prog.reflex_level || 1)}
            ${renderProgBar('Attention Domain', prog.attention_level || 1)}
            ${renderProgBar('Typing Domain', prog.typing_level || 1)}
        `;

        // Achievements Chips
        const chipsContainer = document.getElementById('prof-achievements-chips');
        const earned = (u.achievements && u.achievements.earned_list) || [];
        if (earned.length === 0) {
            chipsContainer.innerHTML = '<span class="text-muted" style="font-size:0.85rem;">No badges unlocked yet. Complete challenges to earn milestones!</span>';
        } else {
            chipsContainer.innerHTML = earned.map(a => `
                <span class="badge badge-info" style="margin: 0.2rem 0.35rem 0.2rem 0; font-size:0.8rem;">
                    🏆 ${a.title.replace(/_/g, ' ')}
                </span>
            `).join('');
        }
    }

    // Embed Complete Achievements List inside Profile Right Column (Issue 4)
    if (achRes && achRes.ok && achRes.data.success) {
        const earnedCount = achRes.data.earned_count || 0;
        const totalCount = achRes.data.total_achievements || 7;
        const earnedEl = document.getElementById('prof-ach-earned-count');
        const totalEl = document.getElementById('prof-ach-total-count');
        if (earnedEl) earnedEl.textContent = earnedCount;
        if (totalEl) totalEl.textContent = totalCount;

        const achGrid = document.getElementById('prof-achievements-grid');
        if (achGrid && achRes.data.achievements) {
            const icons = {
                FIRST_SESSION: '🚀',
                MEMORY_MASTER: '🧠',
                REFLEX_MASTER: '⚡',
                ATTENTION_MASTER: '🎯',
                TYPING_MASTER: '⌨️',
                CONSISTENCY_AWARD: '🏆',
                HIGH_PERFORMER: '💎'
            };

            achGrid.innerHTML = achRes.data.achievements.map(ach => `
                <div class="achievement-card ${ach.earned ? 'earned' : 'unearned'}">
                    <div class="ach-icon-circle">${icons[ach.title] || '🏅'}</div>
                    <div>
                        <div class="ach-title">${ach.title.replace(/_/g, ' ')}</div>
                        <div class="ach-desc">${ach.description}</div>
                        ${ach.earned ? `<div class="ach-date">✓ Earned on ${new Date(ach.earned_date).toLocaleDateString()}</div>` : '<div class="text-muted" style="font-size:0.75rem; margin-top:0.35rem;">🔒 Locked Milestone</div>'}
                    </div>
                </div>
            `).join('');
        }
    }

    // Profile Recent Activity Section
    const activityTbody = document.getElementById('prof-activity-tbody');
    if (activityTbody) {
        if (histRes.ok && histRes.data.success && histRes.data.session_history?.length > 0) {
            activityTbody.innerHTML = histRes.data.session_history.slice(0, 5).map(s => `
                <tr>
                    <td>${new Date(s.session_date).toLocaleString()}</td>
                    <td><code class="code-badge">${s.session_id.slice(0, 8)}...</code></td>
                    <td><strong class="gradient-text">${s.overall_score} pts</strong></td>
                    <td><span class="badge badge-info">VERIFIED</span></td>
                </tr>
            `).join('');
        } else {
            activityTbody.innerHTML = '<tr><td colspan="4" class="text-muted" style="text-align:center;">No recent activity recorded yet. Launch your first session!</td></tr>';
        }
    }
}

// ================= APP INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
    // Mobile menu toggle
    const toggle = document.getElementById('menu-toggle');
    if (toggle) {
        toggle.addEventListener('click', () => {
            const navLinks = document.getElementById('nav-links');
            if (navLinks) navLinks.classList.toggle('open');
        });
    }

    // Confirmation Modal Action Buttons
    const cancelModalBtn = document.getElementById('btn-confirm-cancel');
    if (cancelModalBtn) {
        cancelModalBtn.addEventListener('click', closeConfirmModal);
    }

    // Global Reset All Challenges Button in Profile
    const resetAllBtn = document.getElementById('btn-reset-all-challenges');
    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', confirmResetAllProgress);
    }

    checkAuthSession();
    navigateTo('home');
});
