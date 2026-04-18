// ════════════════════════════════════════════════════════
//  PHOENIX — main.js  v3
//  Всички бъгове оправени, пълна функционалност
// ════════════════════════════════════════════════════════

let currentIncidentId = null;
let chatInterval      = null;

// ── Utils ────────────────────────────────────────────────

function esc(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toggle(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const showing = el.style.display === 'block' || el.style.display === 'flex';
    // Затвори всички странични панели
    ['teamsPanel','adminPanel','vehiclesPanel'].forEach(pid => {
        const p = document.getElementById(pid);
        if (p && pid !== id) p.style.display = 'none';
    });
    el.style.display = showing ? 'none' : (id === 'addForm' ? 'block' : 'flex');
}

function stopProp(e) { e.stopPropagation(); }

// ── Тема ─────────────────────────────────────────────────

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const ti = document.getElementById('ti');
    const tryMap = () => {
        if (!window.mapObj || !window.darkLayer || !window.lightLayer) {
            return setTimeout(tryMap, 300);
        }
        if (theme === 'light') {
            try { window.mapObj.removeLayer(window.darkLayer); } catch(e){}
            window.mapObj.addLayer(window.lightLayer);
            if (ti) ti.className = 'fas fa-moon';
        } else {
            try { window.mapObj.removeLayer(window.lightLayer); } catch(e){}
            window.mapObj.addLayer(window.darkLayer);
            if (ti) ti.className = 'fas fa-sun';
        }
    };
    tryMap();
}

function toggleT() {
    applyTheme(
        document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    );
}

// ── Карта ────────────────────────────────────────────────

function runSmartSearch() {
    const q = (document.getElementById('smartSearch').value || '').toLowerCase().trim();
    document.querySelectorAll('.glass-item').forEach(c => {
        c.style.display = (!q || q.length < 2 || c.innerText.toLowerCase().includes(q))
            ? '' : 'none';
    });
    if (q.length >= 2) {
        const m = (window.incData || []).find(i => i.title.toLowerCase().includes(q));
        if (m) zoomTo(m.lat, m.lon, m.id);
    }
}

function zoomTo(lat, lon, id) {
    if (!window.mapObj) return;
    window.mapObj.flyTo([lat, lon], 14, { animate: true, duration: 2 });
    const d = (window.incData || []).find(x => String(x.id) === String(id));
    if (d && window[d.marker_id]) setTimeout(() => window[d.marker_id].openPopup(), 1800);

    currentIncidentId = String(id);

    // Активен клас в списъка
    document.querySelectorAll('.glass-item[data-inc-id]').forEach(el => {
        el.classList.toggle('active-incident', String(el.dataset.incId) === currentIncidentId);
    });

    // Зареди данни и покажи панела
    loadTasks(id);
    loadChat(id);
    const panel = document.getElementById('incidentPanel');
    if (panel) panel.style.display = 'flex';

    // Авто-обновяване на чата
    if (chatInterval) clearInterval(chatInterval);
    chatInterval = setInterval(() => loadChat(id), 8000);
}

function hidePanel() {
    const p = document.getElementById('incidentPanel');
    if (p) p.style.display = 'none';
    if (chatInterval) clearInterval(chatInterval);
}

// ── Tasks ────────────────────────────────────────────────

const TYPE_ICONS = { operative:'🔥', logistics:'🚛', admin:'📋' };

async function loadTasks(incId) {
    try {
        const r = await fetch(`/tasks/${incId}`);
        if (!r.ok) throw r.status;
        const tasks = await r.json();
        const list  = document.getElementById('taskList');
        if (!list) return;

        if (!tasks.length) {
            list.innerHTML = '<p class="empty-hint">Няма задачи</p>';
            return;
        }
        list.innerHTML = tasks.map(t => `
            <div class="task-item ${t.status==='done'?'task-done':''}">
                <span class="task-icon">${TYPE_ICONS[t.task_type]||'📌'}</span>
                <span class="task-title">
                    ${esc(t.title)}
                    ${t.assigned_to ? `<em> · ${esc(t.assigned_to)}</em>` : ''}
                </span>
                ${t.status!=='done'
                    ? `<button class="btn-xs btn-green" onclick="completeTask(${t.id})">✓</button>`
                    : '<span class="badge-done">✓</span>'
                }
            </div>`).join('');
    } catch(e) { console.error('loadTasks', e); }
}

async function addTask() {
    const inp  = document.getElementById('newTaskInput');
    const sel  = document.getElementById('taskType');
    const asgn = document.getElementById('taskAssign');
    const title = inp ? inp.value.trim() : '';
    if (!title || !currentIncidentId) return;
    try {
        const r = await fetch('/tasks/add', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                incident_id: currentIncidentId,
                title,
                task_type:   sel  ? sel.value  : 'operative',
                assigned_to: asgn ? asgn.value : ''
            })
        });
        if (!r.ok) throw r.status;
        if (inp) inp.value = '';
        loadTasks(currentIncidentId);
    } catch(e) { console.error('addTask', e); }
}

async function completeTask(taskId) {
    try {
        await fetch(`/tasks/${taskId}/complete`, { method:'POST' });
        if (currentIncidentId) loadTasks(currentIncidentId);
    } catch(e) { console.error('completeTask', e); }
}

// ── Chat ─────────────────────────────────────────────────

const TEMPLATES = [
    '🚒 Пристигнахме на място',
    '🔥 Пожарът е локализиран',
    '💧 Нужна е цистерна с вода',
    '🏥 Има пострадал — нужна е линейка',
    '✅ Произшествието е ликвидирано',
    '⚠️ Обстановката се усложнява',
    '🌬️ Вятърът смени посоката',
    '👥 Нужни са допълнителни екипи',
];

function buildTemplates() {
    const c = document.getElementById('templateButtons');
    if (!c) return;
    c.innerHTML = TEMPLATES.map(t =>
        `<button class="tmpl-btn" onclick="sendMsg(${JSON.stringify(t)})">${t}</button>`
    ).join('');
}

async function loadChat(incId) {
    try {
        const r = await fetch(`/chat/${incId}`);
        if (!r.ok) throw r.status;
        const msgs = await r.json();
        const box  = document.getElementById('chatMessages');
        if (!box) return;

        const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 24;

        if (!msgs.length) {
            box.innerHTML = '<p class="empty-hint">Няма съобщения</p>';
            return;
        }
        box.innerHTML = msgs.map(m => `
            <div class="chat-msg">
                <span class="chat-user">${esc(m.user)}</span>
                <span class="chat-time">${m.time}</span>
                <div class="chat-text">${esc(m.text)}</div>
            </div>`).join('');

        if (atBottom) box.scrollTop = box.scrollHeight;
    } catch(e) { console.error('loadChat', e); }
}

async function sendMsg(text) {
    const inp = document.getElementById('chatInput');
    const msg = text || (inp ? inp.value.trim() : '');
    if (!msg || !currentIncidentId) return;
    try {
        const r = await fetch('/chat/send', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ incident_id: currentIncidentId, text: msg })
        });
        if (!r.ok) throw r.status;
        if (!text && inp) inp.value = '';
        loadChat(currentIncidentId);
    } catch(e) { console.error('sendMsg', e); }
}

// ── Team members ──────────────────────────────────────────

const STATUS_INFO = {
    available:    { icon:'🟢', label:'Наличен' },
    on_incident:  { icon:'🔴', label:'На произшествие' },
    leave:        { icon:'🟡', label:'Отпуск' },
    sick:         { icon:'⚪', label:'Болничен' },
    off_duty:     { icon:'⬛', label:'Извън смяна' },
};

async function loadMembers() {
    try {
        const r = await fetch('/members');
        if (!r.ok) throw r.status;
        const members = await r.json();
        const cont    = document.getElementById('membersList');
        const summary = document.getElementById('memberSummary');
        if (!cont) return;

        const onShift  = members.filter(m => m.on_shift).length;
        const avail    = members.filter(m => m.on_shift && m.status === 'available').length;
        if (summary) summary.textContent = `На смяна: ${onShift}  |  Налични: ${avail}`;

        if (!members.length) {
            cont.innerHTML = '<p class="empty-hint">Няма добавени служители</p>';
            return;
        }
        cont.innerHTML = members.map(m => {
            const s = STATUS_INFO[m.status] || { icon:'⚪', label: m.status };
            return `
            <div class="member-item ${!m.on_shift ? 'member-off' : ''}">
                <span>${s.icon}</span>
                <div class="member-info">
                    <span class="member-name">${esc(m.name)}</span>
                    ${m.vehicle ? `<span class="member-vehicle">${esc(m.vehicle)}</span>` : ''}
                    ${m.shift_notes ? `<span class="member-note">${esc(m.shift_notes)}</span>` : ''}
                </div>
                <div class="member-actions">
                    <span class="member-status-label">${s.label}</span>
                </div>
            </div>`;
        }).join('');
    } catch(e) { console.error('loadMembers', e); }
}

async function addMember() {
    const name = (document.getElementById('newMemberName')?.value || '').trim();
    const vid  = document.getElementById('newMemberVehicle')?.value || '';
    if (!name) return;
    try {
        await fetch('/members/add', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ name, vehicle_id: vid || null, start_shift: true })
        });
        document.getElementById('newMemberName').value = '';
        loadMembers();
    } catch(e) { console.error('addMember', e); }
}

// ── Vehicles ──────────────────────────────────────────────

async function loadVehicles(region) {
    try {
        const url = region ? `/vehicles?region=${encodeURIComponent(region)}` : '/vehicles';
        const r   = await fetch(url);
        if (!r.ok) throw r.status;
        const vehicles = await r.json();
        const cont     = document.getElementById('vehiclesList');
        if (!cont) return;

        const vstat = { available:'🟢', deployed:'🔴', maintenance:'🟡' };
        const vtypes = [...new Set(vehicles.map(v => v.region))].sort();

        // Групира по регион
        let html = '';
        vtypes.forEach(reg => {
            const rv = vehicles.filter(v => v.region === reg);
            html += `<div class="vehicle-region-header">${reg} (${rv.length})</div>`;
            html += rv.map(v => `
                <div class="vehicle-item">
                    <span>${vstat[v.status]||'⚪'}</span>
                    <div class="vehicle-info">
                        <span class="vehicle-sign">${esc(v.call_sign)}</span>
                        <span class="vehicle-type">${esc(v.vehicle_type)}${v.model ? ' · '+esc(v.model) : ''}</span>
                        <span class="vehicle-station">${esc(v.station)}</span>
                        ${v.water_cap_l ? `<span class="vehicle-water">💧 ${v.water_cap_l.toLocaleString()} л</span>` : ''}
                    </div>
                    <select class="xs-select" onchange="updateVehicleStatus(${v.id}, this.value)">
                        <option value="available"   ${v.status==='available'   ?'selected':''}>Наличен</option>
                        <option value="deployed"    ${v.status==='deployed'    ?'selected':''}>Изпратен</option>
                        <option value="maintenance" ${v.status==='maintenance' ?'selected':''}>Ремонт</option>
                    </select>
                </div>`).join('');
        });
        cont.innerHTML = html || '<p class="empty-hint">Няма резултати</p>';
    } catch(e) { console.error('loadVehicles', e); }
}

async function updateVehicleStatus(id, status) {
    try {
        await fetch(`/vehicles/${id}/status`, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ status })
        });
    } catch(e) { console.error('updateVehicleStatus', e); }
}

// ── Admin: смяна на роля ──────────────────────────────────

async function changeRole(userId, newRole) {
    if (!newRole) return;
    try {
        const r = await fetch(`/promote/${userId}`, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ role: newRole })
        });
        if (!r.ok) throw r.status;
        const badge = document.getElementById(`rb-${userId}`);
        if (badge) { badge.textContent = newRole; badge.className = `role-badge role-${newRole}`; }
    } catch(e) { alert('Грешка при смяна на роля'); }
}

// ── SOS ──────────────────────────────────────────────────

function sendSOS() {
    const send = (lat, lon) =>
        fetch('/sos', { method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ lat, lon }) })
        .then(() => alert('🆘 SOS изпратен до оперативния център!'));

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            p => send(p.coords.latitude, p.coords.longitude),
            () => send(null, null)
        );
    } else { send(null, null); }
}

// ── Init ─────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    // Тема
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    setTimeout(() => applyTheme(saved), 900);

    // Анимация sidebar
    if (typeof anime !== 'undefined') {
        anime({ targets:'#sidebar', translateX:[-360,0], duration:1000, easing:'easeOutExpo' });
    }

    // Чат шаблони
    buildTemplates();

    // Зареди членове
    loadMembers();
    setInterval(loadMembers, 30000);

    // stopPropagation на всички панели за да не се затварят при кликване вътре
    ['incidentPanel','teamsPanel','adminPanel','vehiclesPanel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', e => e.stopPropagation());
    });
});