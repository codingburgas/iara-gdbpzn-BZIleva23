// ============================================================
//  PHOENIX — main.js  (v2 — всички бъгове оправени)
// ============================================================

// ── Текущо избрано произшествие ──────────────────────────────
let currentIncidentId = null;
let chatPollInterval = null;

// ── Помощни функции ──────────────────────────────────────────

function toggle(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

// Показва/скрива десния панел БЕЗ да го затваря при кликване вътре
function showPanel() {
    const panel = document.getElementById('incidentPanel');
    if (panel) {
        panel.style.display = 'flex';
        panel.style.visibility = 'visible';
    }
}

function hidePanel() {
    const panel = document.getElementById('incidentPanel');
    if (panel) panel.style.display = 'none';
    if (chatPollInterval) clearInterval(chatPollInterval);
}

// ── Търсене ──────────────────────────────────────────────────

function runSmartSearch() {
    const query = document.getElementById('smartSearch').value.toLowerCase().trim();
    document.querySelectorAll('.glass-item').forEach(card => {
        card.style.display = (!query || query.length < 2 || card.innerText.toLowerCase().includes(query))
            ? 'block' : 'none';
    });
    if (query.length >= 2) {
        const match = (window.incData || []).find(i => i.title.toLowerCase().includes(query));
        if (match) zoomTo(match.lat, match.lon, match.id);
    }
}

// ── Карта ────────────────────────────────────────────────────

function zoomTo(lat, lon, id) {
    if (!window.mapObj) return;
    window.mapObj.flyTo([lat, lon], 14, { animate: true, duration: 2 });
    const data = (window.incData || []).find(x => String(x.id) === String(id));
    if (data && window[data.marker_id]) {
        setTimeout(() => window[data.marker_id].openPopup(), 1800);
    }
    // Зарежда оперативния панел за това произшествие
    currentIncidentId = id;
    loadTasks(id);
    loadChat(id);
    showPanel();

    // Авто-обновяване на чата
    if (chatPollInterval) clearInterval(chatPollInterval);
    chatPollInterval = setInterval(() => loadChat(id), 8000);

    // Маркира активното произшествие в списъка
    document.querySelectorAll('.glass-item').forEach(el => el.classList.remove('active-incident'));
    document.querySelectorAll('.glass-item').forEach(el => {
        if (el.dataset.incId && String(el.dataset.incId) === String(id)) {
            el.classList.add('active-incident');
        }
    });
}

// ── Тема (светла / тъмна) ────────────────────────────────────

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const ti = document.getElementById('ti');

    // Изчакваме mapObj да е готов
    const applyMap = () => {
        if (!window.mapObj || !window.darkLayer || !window.lightLayer) {
            setTimeout(applyMap, 200);
            return;
        }
        if (theme === 'light') {
            try { window.mapObj.removeLayer(window.darkLayer); } catch(e) {}
            window.mapObj.addLayer(window.lightLayer);
            if (ti) ti.className = 'fas fa-moon';
        } else {
            try { window.mapObj.removeLayer(window.lightLayer); } catch(e) {}
            window.mapObj.addLayer(window.darkLayer);
            if (ti) ti.className = 'fas fa-sun';
        }
    };
    applyMap();
}

function toggleT() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ── Задачи ───────────────────────────────────────────────────

async function loadTasks(incidentId) {
    try {
        const res = await fetch(`/tasks/${incidentId}`);
        if (!res.ok) throw new Error(res.status);
        const tasks = await res.json();
        const list = document.getElementById('taskList');
        if (!list) return;

        if (tasks.length === 0) {
            list.innerHTML = '<p style="opacity:0.4; font-size:12px; text-align:center; padding:8px 0;">Няма задачи</p>';
            return;
        }

        const typeLabels = { operative: '🔥', logistics: '🚛', admin: '📋' };

        list.innerHTML = tasks.map(t => `
            <div class="task-item ${t.status === 'done' ? 'task-done' : ''}">
                <span class="task-icon">${typeLabels[t.task_type] || '📌'}</span>
                <span class="task-title">${t.title}${t.assigned_to ? ` <em>(${t.assigned_to})</em>` : ''}</span>
                ${t.status !== 'done'
                    ? `<button class="btn-small btn-green" onclick="completeTask(${t.id})">✓</button>`
                    : '<span class="badge-done">Готово</span>'
                }
            </div>`).join('');
    } catch(e) {
        console.error('loadTasks:', e);
    }
}

async function addTask() {
    const input = document.getElementById('newTaskInput');
    const typeSelect = document.getElementById('taskType');
    const title = input ? input.value.trim() : '';
    if (!title || !currentIncidentId) return;

    try {
        const res = await fetch('/tasks/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                incident_id: currentIncidentId,
                title: title,
                task_type: typeSelect ? typeSelect.value : 'operative'
            })
        });
        if (!res.ok) throw new Error(res.status);
        if (input) input.value = '';
        await loadTasks(currentIncidentId);
    } catch(e) {
        console.error('addTask:', e);
    }
}

async function completeTask(taskId) {
    try {
        await fetch(`/tasks/${taskId}/complete`, { method: 'POST' });
        if (currentIncidentId) await loadTasks(currentIncidentId);
    } catch(e) {
        console.error('completeTask:', e);
    }
}

// ── Чат канал ────────────────────────────────────────────────

const MSG_TEMPLATES = [
    '🚒 Пристигнахме на място',
    '🔥 Пожарът е локализиран',
    '💧 Нужна е цистерна с вода',
    '🏥 Има пострадал — нужна е линейка',
    '✅ Произшествието е ликвидирано',
    '⚠️ Обстановката се усложнява',
    '🌬️ Вятърът е сменил посоката',
    '👥 Нужни са допълнителни екипи',
];

function buildTemplateButtons() {
    const cont = document.getElementById('templateButtons');
    if (!cont) return;
    cont.innerHTML = MSG_TEMPLATES.map(t =>
        `<button class="template-btn" onclick="sendChatMessage('${t.replace(/'/g, "\\'")}')">${t}</button>`
    ).join('');
}

async function loadChat(incidentId) {
    try {
        const res = await fetch(`/chat/${incidentId}`);
        if (!res.ok) throw new Error(res.status);
        const msgs = await res.json();
        const box = document.getElementById('chatMessages');
        if (!box) return;

        const wasAtBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 20;

        if (msgs.length === 0) {
            box.innerHTML = '<p style="opacity:0.4; font-size:12px; text-align:center; padding:12px 0;">Няма съобщения</p>';
            return;
        }

        box.innerHTML = msgs.map(m => `
            <div class="chat-msg">
                <div class="chat-header">
                    <span class="chat-user">${escapeHtml(m.user)}</span>
                    <span class="chat-time">${m.time}</span>
                </div>
                <div class="chat-text">${escapeHtml(m.text)}</div>
            </div>`).join('');

        if (wasAtBottom) box.scrollTop = box.scrollHeight;
    } catch(e) {
        console.error('loadChat:', e);
    }
}

async function sendChatMessage(text) {
    const input = document.getElementById('chatInput');
    const msg = text || (input ? input.value.trim() : '');
    if (!msg || !currentIncidentId) return;

    try {
        const res = await fetch('/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ incident_id: currentIncidentId, text: msg })
        });
        if (!res.ok) throw new Error(res.status);
        if (input && !text) input.value = '';
        await loadChat(currentIncidentId);
    } catch(e) {
        console.error('sendChatMessage:', e);
    }
}

// ── Панел с наличност на екипи ───────────────────────────────

async function loadMembers() {
    try {
        const res = await fetch('/members');
        if (!res.ok) throw new Error(res.status);
        const members = await res.json();
        const cont = document.getElementById('membersList');
        if (!cont) return;

        const statusLabel = {
            available: { icon: '🟢', text: 'Наличен' },
            on_incident: { icon: '🔴', text: 'На произшествие' },
            leave: { icon: '🟡', text: 'Отпуск' },
            sick: { icon: '⚪', text: 'Болничен' },
        };

        const available = members.filter(m => m.status === 'available' && m.shift_active).length;
        const total = members.filter(m => m.shift_active).length;

        const summary = document.getElementById('memberSummary');
        if (summary) {
            summary.textContent = `На смяна: ${total} | Налични: ${available}`;
        }

        if (members.length === 0) {
            cont.innerHTML = '<p style="opacity:0.4; font-size:12px; text-align:center; padding:8px;">Няма добавени служители</p>';
            return;
        }

        cont.innerHTML = members.map(m => {
            const s = statusLabel[m.status] || { icon: '⚪', text: m.status };
            return `
            <div class="member-item ${!m.shift_active ? 'member-off' : ''}">
                <span class="member-icon">${s.icon}</span>
                <div class="member-info">
                    <span class="member-name">${escapeHtml(m.name)}</span>
                    ${m.vehicle ? `<span class="member-vehicle">${escapeHtml(m.vehicle)}</span>` : ''}
                </div>
                <span class="member-status">${s.text}</span>
            </div>`;
        }).join('');
    } catch(e) {
        console.error('loadMembers:', e);
    }
}

// ── Управление на потребители (admin панел) ──────────────────

async function changeRole(userId, newRole) {
    try {
        const res = await fetch(`/promote/${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        if (!res.ok) throw new Error(res.status);
        // Визуален feedback
        const badge = document.getElementById(`role-badge-${userId}`);
        if (badge) {
            badge.textContent = newRole;
            badge.className = `role-badge role-${newRole}`;
        }
    } catch(e) {
        console.error('changeRole:', e);
        alert('Грешка при смяна на роля');
    }
}

// ── SOS сигнал ───────────────────────────────────────────────

function sendSOS() {
    if (!navigator.geolocation) {
        alert('Геолокацията не е поддържана от браузъра');
        return;
    }
    navigator.geolocation.getCurrentPosition(pos => {
        fetch('/sos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        });
        alert('🆘 SOS сигналът е изпратен до оперативния център!');
    }, () => {
        // Fallback ако няма GPS
        fetch('/sos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: null, lon: null })
        });
        alert('🆘 SOS изпратен (без GPS координати)');
    });
}

// ── Помощна функция за XSS защита ────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ── Инициализация ────────────────────────────────────────────

window.onload = () => {
    // Тема — изчакваме картата
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    setTimeout(() => applyTheme(saved), 800);

    // Анимация на sidebar
    if (typeof anime !== 'undefined') {
        anime({ targets: '#sidebar', translateX: [-360, 0], duration: 1000, easing: 'easeOutExpo' });
    }

    // Шаблонни бутони за чат
    buildTemplateButtons();

    // Зарежда членовете на екипа
    loadMembers();
    setInterval(loadMembers, 30000);  // обновява на всеки 30 секунди
};