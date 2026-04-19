// ════════════════════════════════════════════════════════
//  PHOENIX — main.js  v4
//  + GPS навигация, оперативен чат, граждански сигнал, нотификации
// ════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────
let currentIncidentId  = null;
let currentIncidentLat = null;
let currentIncidentLon = null;
let chatInterval       = null;
let gchatInterval      = null;
let notifLastId        = 0;
let notifInterval      = null;

// ── Esc / XSS ────────────────────────────────────────────
function esc(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Панели ───────────────────────────────────────────────
const PANELS = ['teamsPanel','adminPanel','vehiclesPanel','gchatPanel','citizenPanel'];

function toggle(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isOpen = el.style.display !== 'none' && el.style.display !== '';
    // Затвори другите странични панели (не incidentPanel)
    PANELS.forEach(pid => {
        if (pid !== id) {
            const p = document.getElementById(pid);
            if (p) p.style.display = 'none';
        }
    });
    if (id === 'addForm') {
        el.style.display = isOpen ? 'none' : 'block';
    } else {
        el.style.display = isOpen ? 'none' : 'flex';
    }
}

function hidePanel() {
    const p = document.getElementById('incidentPanel');
    if (p) p.style.display = 'none';
    if (chatInterval) clearInterval(chatInterval);
    chatInterval = null;
}

// ── Тема ─────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const ti = document.getElementById('ti');
    const tryMap = () => {
        if (!window.mapObj || !window.darkLayer || !window.lightLayer)
            return setTimeout(tryMap, 300);
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
    tryMap();
}
function toggleT() {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

// ── Търсене ───────────────────────────────────────────────
function runSmartSearch() {
    const q = (document.getElementById('smartSearch').value || '').toLowerCase().trim();
    document.querySelectorAll('.glass-item').forEach(c => {
        c.style.display = (!q || q.length < 2 || c.innerText.toLowerCase().includes(q)) ? '' : 'none';
    });
    if (q.length >= 2) {
        const m = (window.incData || []).find(i => i.title.toLowerCase().includes(q));
        if (m) zoomTo(m.lat, m.lon, m.id);
    }
}

// ── Карта & навигация ─────────────────────────────────────
function zoomTo(lat, lon, id) {
    if (!window.mapObj) return;
    window.mapObj.flyTo([lat, lon], 14, { animate: true, duration: 2 });
    const d = (window.incData || []).find(x => String(x.id) === String(id));
    if (d && window[d.marker_id]) setTimeout(() => window[d.marker_id].openPopup(), 1800);

    currentIncidentId  = String(id);
    currentIncidentLat = lat;
    currentIncidentLon = lon;

    document.querySelectorAll('.glass-item[data-inc-id]').forEach(el =>
        el.classList.toggle('active-incident', String(el.dataset.incId) === currentIncidentId));

    loadTasks(id);
    loadChat(id);

    const panel = document.getElementById('incidentPanel');
    if (panel) panel.style.display = 'flex';

    // Обновяване на координатите в бутона за навигация
    const navBtn = document.getElementById('navBtn');
    if (navBtn) navBtn.style.display = 'flex';

    if (chatInterval) clearInterval(chatInterval);
    chatInterval = setInterval(() => loadChat(id), 8000);
}

function navigateTo() {
    if (!currentIncidentLat || !currentIncidentLon) return;
    // Отваря Google Maps с маршрут до сигнала
    const url = `https://www.google.com/maps/dir/?api=1&destination=${currentIncidentLat},${currentIncidentLon}&travelmode=driving`;
    window.open(url, '_blank');
}

function navigateWaze() {
    if (!currentIncidentLat || !currentIncidentLon) return;
    const url = `https://waze.com/ul?ll=${currentIncidentLat},${currentIncidentLon}&navigate=yes`;
    window.open(url, '_blank');
}

// ── Tasks ─────────────────────────────────────────────────
const TYPE_ICONS = { operative:'🔥', logistics:'🚛', admin:'📋' };

async function loadTasks(incId) {
    try {
        const r = await fetch(`/tasks/${incId}`);
        if (!r.ok) throw r.status;
        const tasks = await r.json();
        const list  = document.getElementById('taskList');
        if (!list) return;
        if (!tasks.length) {
            list.innerHTML = '<p class="empty-hint">Няма задачи</p>'; return;
        }
        list.innerHTML = tasks.map(t => `
            <div class="task-item ${t.status==='done'?'task-done':''}">
                <span class="task-icon">${TYPE_ICONS[t.task_type]||'📌'}</span>
                <span class="task-title">${esc(t.title)}${t.assigned_to?` <em>· ${esc(t.assigned_to)}</em>`:''}</span>
                ${t.status!=='done'
                    ? `<button class="btn-xs btn-green" onclick="completeTask(${t.id})">✓</button>`
                    : '<span class="badge-done">✓</span>'}
            </div>`).join('');
    } catch(e) { console.error('loadTasks', e); }
}

async function addTask() {
    const inp  = document.getElementById('newTaskInput');
    const sel  = document.getElementById('taskType');
    const title = inp ? inp.value.trim() : '';
    if (!title || !currentIncidentId) return;
    try {
        await fetch('/tasks/add', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ incident_id: currentIncidentId, title,
                                   task_type: sel ? sel.value : 'operative' })
        });
        if (inp) inp.value = '';
        loadTasks(currentIncidentId);
    } catch(e) { console.error('addTask', e); }
}

async function completeTask(taskId) {
    try {
        await fetch(`/tasks/${taskId}/complete`, { method: 'POST' });
        if (currentIncidentId) loadTasks(currentIncidentId);
    } catch(e) { console.error('completeTask', e); }
}

// ── Incident Chat ─────────────────────────────────────────
const TEMPLATES = [
    '🚒 Пристигнахме на място','🔥 Пожарът е локализиран',
    '💧 Нужна е цистерна','🏥 Има пострадал — нужна е линейка',
    '✅ Произшествието е ликвидирано','⚠️ Обстановката се усложнява',
    '🌬️ Вятърът смени посоката','👥 Нужни са допълнителни екипи',
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
        renderMsgs('chatMessages', msgs, false);
    } catch(e) { console.error('loadChat', e); }
}

async function sendMsg(text) {
    const inp = document.getElementById('chatInput');
    const msg = text || (inp ? inp.value.trim() : '');
    if (!msg || !currentIncidentId) return;
    try {
        await fetch('/chat/send', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ incident_id: currentIncidentId, text: msg })
        });
        if (!text && inp) inp.value = '';
        loadChat(currentIncidentId);
    } catch(e) { console.error('sendMsg', e); }
}

// ── Global Chat (само admin + firefighter) ────────────────
async function loadGChat() {
    try {
        const r = await fetch('/gchat');
        if (!r.ok) return;
        const msgs = await r.json();
        renderMsgs('gchatMessages', msgs, true);
    } catch(e) { console.error('loadGChat', e); }
}

async function sendGChat() {
    const inp = document.getElementById('gchatInput');
    const msg = inp ? inp.value.trim() : '';
    if (!msg) return;
    try {
        await fetch('/gchat/send', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ text: msg })
        });
        if (inp) inp.value = '';
        loadGChat();
    } catch(e) { console.error('sendGChat', e); }
}

// ── Общ renderer за чат съобщения ─────────────────────────
function renderMsgs(boxId, msgs, showRole) {
    const box = document.getElementById(boxId);
    if (!box) return;
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 24;
    if (!msgs.length) {
        box.innerHTML = '<p class="empty-hint">Няма съобщения</p>'; return;
    }
    const roleColor = { admin: '#f87171', firefighter: '#fb923c' };
    box.innerHTML = msgs.map(m => `
        <div class="chat-msg">
            <span class="chat-user" style="color:${showRole ? (roleColor[m.role]||'#94a3b8') : 'var(--primary)'}">
                ${esc(m.user)}${showRole && m.role ? ` <em style="font-size:10px;opacity:.6">[${m.role}]</em>` : ''}
            </span>
            <span class="chat-time">${m.time}</span>
            <div class="chat-text">${esc(m.text)}</div>
        </div>`).join('');
    if (atBottom) box.scrollTop = box.scrollHeight;
}

// ── Граждански сигнал ─────────────────────────────────────
function openCitizenForm() {
    // Взима GPS позицията на потребителя ако е налична
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const latF = document.getElementById('cLat');
            const lonF = document.getElementById('cLon');
            if (latF) latF.value = pos.coords.latitude.toFixed(6);
            if (lonF) lonF.value = pos.coords.longitude.toFixed(6);
        }, () => {});
    }
    toggle('citizenPanel');
}

async function submitCitizenReport() {
    const get = id => document.getElementById(id);
    const lat  = parseFloat(get('cLat')?.value);
    const lon  = parseFloat(get('cLon')?.value);
    const type = get('cType')?.value;
    const desc = get('cDesc')?.value?.trim();

    if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
        showNotif('⚠️ Въведи валидни GPS координати', 'error'); return;
    }

    const payload = {
        incident_type:  type || 'Граждански сигнал',
        description:    desc || '',
        lat, lon,
        injured:        get('cInjured')?.checked || false,
        injured_count:  parseInt(get('cInjuredCount')?.value) || 0,
        hazmat:         get('cHazmat')?.checked || false,
        reporter_name:  get('cName')?.value?.trim() || '',
        reporter_phone: get('cPhone')?.value?.trim() || '',
    };

    try {
        const r = await fetch('/citizen_report', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await r.json();
        if (data.status === 'ok') {
            showNotif('✅ Сигналът е изпратен успешно! ID: ' + data.id, 'success');
            // Нулира формата
            ['cLat','cLon','cDesc','cName','cPhone','cInjuredCount'].forEach(id => {
                const el = get(id); if (el) el.value = '';
            });
            ['cInjured','cHazmat'].forEach(id => {
                const el = get(id); if (el) el.checked = false;
            });
            toggle('citizenPanel');
            // Презарежда страницата след 2 сек за да се появи новия маркер
            setTimeout(() => location.reload(), 2000);
        }
    } catch(e) { showNotif('❌ Грешка при изпращане', 'error'); }
}

// Показва/скрива полето за брой ранени
function toggleInjuredCount() {
    const cb  = document.getElementById('cInjured');
    const row = document.getElementById('injuredCountRow');
    if (row) row.style.display = cb && cb.checked ? 'flex' : 'none';
}

// ── Browser нотификации ───────────────────────────────────
function requestNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

async function checkNewIncidents() {
    try {
        const r = await fetch(`/incidents/new_since/${notifLastId}`);
        if (!r.ok) return;
        const newIncs = await r.json();
        if (newIncs.length) {
            notifLastId = Math.max(...newIncs.map(i => i.id));
            newIncs.forEach(inc => {
                // In-app toast
                showNotif(`🚨 НОВ СИГНАЛ: ${inc.title}${inc.source==='citizen'?' (граждански)':''}`, 'alert');
                // Browser notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('PHOENIX — Нов сигнал', {
                        body: inc.title,
                        icon: '/static/favicon.ico'
                    });
                }
            });
        }
    } catch(e) {}
}

// ── Toast нотификации ─────────────────────────────────────
function showNotif(msg, type='info') {
    const cont = document.getElementById('toastContainer');
    if (!cont) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    cont.appendChild(t);
    setTimeout(() => t.classList.add('toast-show'), 10);
    setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 400); }, 4000);
}

// ── Team members ──────────────────────────────────────────
const STATUS_INFO = {
    available:   { icon:'🟢', label:'Наличен' },
    on_incident: { icon:'🔴', label:'На произшествие' },
    leave:       { icon:'🟡', label:'Отпуск' },
    sick:        { icon:'⚪', label:'Болничен' },
    off_duty:    { icon:'⬛', label:'Извън смяна' },
};

async function loadMembers() {
    try {
        const r = await fetch('/members');
        if (!r.ok) throw r.status;
        const members = await r.json();
        const cont    = document.getElementById('membersList');
        const summary = document.getElementById('memberSummary');
        if (!cont) return;
        const onShift = members.filter(m => m.on_shift).length;
        const avail   = members.filter(m => m.on_shift && m.status === 'available').length;
        if (summary) summary.textContent = `На смяна: ${onShift}  |  Налични: ${avail}`;
        if (!members.length) { cont.innerHTML = '<p class="empty-hint">Няма служители</p>'; return; }
        cont.innerHTML = members.map(m => {
            const s = STATUS_INFO[m.status] || { icon:'⚪', label: m.status };
            return `<div class="member-item ${!m.on_shift?'member-off':''}">
                <span>${s.icon}</span>
                <div class="member-info">
                    <span class="member-name">${esc(m.name)}</span>
                    ${m.vehicle?`<span class="member-vehicle">${esc(m.vehicle)}</span>`:''}
                    ${m.shift_notes?`<span class="member-note">${esc(m.shift_notes)}</span>`:''}
                </div>
                <span class="member-status-label">${s.label}</span>
            </div>`;
        }).join('');
    } catch(e) { console.error('loadMembers', e); }
}

async function addMember() {
    const name = (document.getElementById('newMemberName')?.value||'').trim();
    const vid  = document.getElementById('newMemberVehicle')?.value||'';
    if (!name) return;
    await fetch('/members/add', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name, vehicle_id: vid||null, start_shift: true })
    });
    document.getElementById('newMemberName').value = '';
    loadMembers();
}

// ── Vehicles ──────────────────────────────────────────────
async function loadVehicles(region) {
    try {
        const r = await fetch(region ? `/vehicles?region=${encodeURIComponent(region)}` : '/vehicles');
        if (!r.ok) throw r.status;
        const vehicles = await r.json();
        const cont = document.getElementById('vehiclesList');
        if (!cont) return;
        const vstat = { available:'🟢', deployed:'🔴', maintenance:'🟡' };
        const regions = [...new Set(vehicles.map(v => v.region))].sort();
        let html = '';
        regions.forEach(reg => {
            const rv = vehicles.filter(v => v.region === reg);
            html += `<div class="vehicle-region-header">${reg} (${rv.length})</div>`;
            html += rv.map(v => `
                <div class="vehicle-item">
                    <span>${vstat[v.status]||'⚪'}</span>
                    <div class="vehicle-info">
                        <span class="vehicle-sign">${esc(v.call_sign)}</span>
                        <span class="vehicle-type">${esc(v.vehicle_type)}${v.model?' · '+esc(v.model):''}</span>
                        <span class="vehicle-station">${esc(v.station)}</span>
                        ${v.water_cap_l?`<span class="vehicle-water">💧 ${v.water_cap_l.toLocaleString()} л`:''}
                    </div>
                    <select class="xs-select" onchange="updateVehicleStatus(${v.id},this.value)">
                        <option value="available"   ${v.status==='available'?'selected':''}>Наличен</option>
                        <option value="deployed"    ${v.status==='deployed'?'selected':''}>Изпратен</option>
                        <option value="maintenance" ${v.status==='maintenance'?'selected':''}>Ремонт</option>
                    </select>
                </div>`).join('');
        });
        cont.innerHTML = html || '<p class="empty-hint">Няма резултати</p>';
    } catch(e) { console.error('loadVehicles', e); }
}

async function updateVehicleStatus(id, status) {
    try {
        await fetch(`/vehicles/${id}/status`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ status })
        });
    } catch(e) {}
}

// ── Admin роли ────────────────────────────────────────────
async function changeRole(userId, newRole) {
    if (!newRole) return;
    try {
        const r = await fetch(`/promote/${userId}`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ role: newRole })
        });
        if (!r.ok) throw r.status;
        const badge = document.getElementById(`rb-${userId}`);
        if (badge) { badge.textContent = newRole; badge.className = `role-badge role-${newRole}`; }
    } catch(e) { alert('Грешка при смяна на роля'); }
}

// ── SOS ───────────────────────────────────────────────────
function sendSOS() {
    const send = (lat, lon) =>
        fetch('/sos', { method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({ lat, lon }) })
        .then(() => showNotif('🆘 SOS изпратен до оперативния център!', 'alert'));
    navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(
            p => send(p.coords.latitude, p.coords.longitude), () => send(null, null))
        : send(null, null);
}

// ── Init ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    // Тема
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    setTimeout(() => applyTheme(saved), 900);

    // Анимация
    if (typeof anime !== 'undefined')
        anime({ targets:'#sidebar', translateX:[-360,0], duration:1000, easing:'easeOutExpo' });

    // Шаблони за чат
    buildTemplates();

    // Членове на екипа
    loadMembers();
    setInterval(loadMembers, 30000);

    // Нотификации
    requestNotifPermission();
    // Инициализира lastId от вече заредените произшествия
    if (window.incData && window.incData.length)
        notifLastId = Math.max(...window.incData.map(i => i.id));
    notifInterval = setInterval(checkNewIncidents, 15000);

    // stopPropagation на всички панели
    [...PANELS, 'incidentPanel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', e => e.stopPropagation());
    });
});