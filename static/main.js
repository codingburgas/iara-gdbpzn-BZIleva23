// ============================================================
//  PHOENIX — main.js
//  Оперативна система на ГДПБЗН
// ============================================================

// ── Помощни функции ──────────────────────────────────────────

function toggle(id) {
    const el = document.getElementById(id);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ── Търсене ──────────────────────────────────────────────────

function runSmartSearch() {
    const query = document.getElementById('smartSearch').value.toLowerCase();
    if (query.length < 2) {
        document.querySelectorAll('.glass-item').forEach(c => c.style.display = 'block');
        return;
    }
    const match = window.incData.find(i => i.title.toLowerCase().includes(query));
    if (match) zoomTo(match.lat, match.lon, match.id);

    document.querySelectorAll('.glass-item').forEach(card => {
        card.style.display = card.innerText.toLowerCase().includes(query) ? 'block' : 'none';
    });
}

// ── Карта ────────────────────────────────────────────────────

function zoomTo(lat, lon, id) {
    window.mapObj.flyTo([lat, lon], 14, { animate: true, duration: 2 });
    const data = window.incData.find(x => x.id == id);
    if (data && window[data.marker_id]) {
        setTimeout(() => window[data.marker_id].openPopup(), 1800);
    }
    // Зарежда задачите и чата за избраното произшествие
    loadTasks(id);
    loadChat(id);
    document.getElementById('currentIncidentId').value = id;
    const panel = document.getElementById('incidentPanel');
    if (panel) panel.style.display = 'block';
}

// ── Тема (светла / тъмна) ────────────────────────────────────

function toggleT() {
    const h = document.documentElement;
    const isD = h.getAttribute('data-theme') === 'dark';
    const next = isD ? 'light' : 'dark';
    h.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);

    if (next === 'light') {
        window.mapObj.removeLayer(window.darkLayer);
        window.mapObj.addLayer(window.lightLayer);
        document.getElementById('ti').className = 'fas fa-moon';
    } else {
        window.mapObj.removeLayer(window.lightLayer);
        window.mapObj.addLayer(window.darkLayer);
        document.getElementById('ti').className = 'fas fa-sun';
    }
}

// ── Задачи ───────────────────────────────────────────────────

async function loadTasks(incidentId) {
    const res = await fetch(`/tasks/${incidentId}`);
    const tasks = await res.json();
    const list = document.getElementById('taskList');
    if (!list) return;
    list.innerHTML = tasks.length === 0
        ? '<p style="opacity:0.5; font-size:12px;">Няма задачи</p>'
        : tasks.map(t => `
            <div class="glass-item task-item" style="display:flex; justify-content:space-between; align-items:center;">
                <span style="${t.status === 'done' ? 'text-decoration:line-through;opacity:0.5' : ''}">${t.title}</span>
                ${t.status !== 'done'
                    ? `<button class="btn btn-red" style="padding:4px 10px; font-size:11px; width:auto;"
                        onclick="completeTask(${t.id})">✓</button>`
                    : '<span style="color:#238636; font-size:12px;">✓ Готово</span>'
                }
            </div>`).join('');
}

async function addTask() {
    const incId = document.getElementById('currentIncidentId').value;
    const title = document.getElementById('newTaskInput').value.trim();
    if (!title || !incId) return;
    await fetch('/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: incId, title })
    });
    document.getElementById('newTaskInput').value = '';
    loadTasks(incId);
}

async function completeTask(taskId) {
    const incId = document.getElementById('currentIncidentId').value;
    await fetch(`/tasks/${taskId}/complete`, { method: 'POST' });
    loadTasks(incId);
}

// ── Чат канал ────────────────────────────────────────────────

const MSG_TEMPLATES = [
    '🚒 Пристигнахме на място',
    '🔥 Пожарът е локализиран',
    '💧 Нужна е допълнителна цистерна',
    '🏥 Има пострадал — необходима е линейка',
    '✅ Произшествието е ликвидирано',
    '⚠️ Обстановката се усложнява',
];

async function loadChat(incidentId) {
    const res = await fetch(`/chat/${incidentId}`);
    const msgs = await res.json();
    const box = document.getElementById('chatMessages');
    if (!box) return;
    box.innerHTML = msgs.map(m => `
        <div style="margin:6px 0; font-size:12px;">
            <span style="color:var(--primary); font-weight:bold;">${m.user}</span>
            <span style="opacity:0.5; font-size:10px; margin-left:4px;">${m.time}</span><br>
            ${m.text}
        </div>`).join('');
    box.scrollTop = box.scrollHeight;
}

async function sendChatMessage(text) {
    const incId = document.getElementById('currentIncidentId').value;
    if (!text || !incId) return;
    await fetch('/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: incId, text })
    });
    document.getElementById('chatInput').value = '';
    loadChat(incId);
}

function sendTemplate(msg) {
    sendChatMessage(msg);
}

function buildTemplateButtons() {
    const cont = document.getElementById('templateButtons');
    if (!cont) return;
    cont.innerHTML = MSG_TEMPLATES.map(t =>
        `<button class="btn btn-red" style="padding:4px 8px; font-size:11px; width:auto; margin:2px;"
            onclick="sendTemplate('${t}')">${t}</button>`
    ).join('');
}

// ── SOS сигнал ───────────────────────────────────────────────

function sendSOS() {
    if (!navigator.geolocation) {
        alert('Геолокацията не е поддържана');
        return;
    }
    navigator.geolocation.getCurrentPosition(pos => {
        fetch('/sos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        });
        alert('🆘 SOS сигналът е изпратен до оперативния център!');
    });
}

// ── Инициализация ────────────────────────────────────────────

window.onload = () => {
    // Тема
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    setTimeout(() => {
        if (saved === 'light') {
            window.mapObj.removeLayer(window.darkLayer);
            window.mapObj.addLayer(window.lightLayer);
            const ti = document.getElementById('ti');
            if (ti) ti.className = 'fas fa-moon';
        }
    }, 600);

    // Анимация на sidebar
    anime({ targets: '#sidebar', translateX: [-360, 0], duration: 1000, easing: 'easeOutExpo' });

    // Шаблонни бутони за чат
    buildTemplateButtons();
};