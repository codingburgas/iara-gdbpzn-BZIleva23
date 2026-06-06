// ════════════════════════════════════════════════════════
//  PHOENIX — main.js  v5
//  GPS fix, снимки, смени, изпращане на екип към сигнал
// ════════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────────
let currentIncidentId  = null;
let currentIncidentLat = null;
let currentIncidentLon = null;
let chatInterval       = null;
let gchatInterval      = null;
let notifLastId        = 0;

// ── Utils ─────────────────────────────────────────────────
function esc(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Панели ────────────────────────────────────────────────
const SIDE_PANELS = ['teamsPanel','adminPanel','vehiclesPanel','gchatPanel','citizenPanel'];

function toggle(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isOpen = el.style.display !== 'none' && el.style.display !== '';
    SIDE_PANELS.forEach(pid => {
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
    if (chatInterval) { clearInterval(chatInterval); chatInterval = null; }
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

// ── Карта ────────────────────────────────────────────────
function zoomTo(lat, lon, id) {
    if (!window.mapObj) return;
    window.mapObj.flyTo([lat, lon], 14, { animate: true, duration: 2 });
    const d = (window.incData || []).find(x => String(x.id) === String(id));
    if (d && window[d.marker_id]) setTimeout(() => window[d.marker_id].openPopup(), 1800);

    currentIncidentId  = String(id);
    currentIncidentLat = lat;
    currentIncidentLon = lon;

    // Активен клас
    document.querySelectorAll('.glass-item[data-inc-id]').forEach(el =>
        el.classList.toggle('active-incident', String(el.dataset.incId) === currentIncidentId));

    // Покажи оперативния панел
    const panel = document.getElementById('incidentPanel');
    if (panel) panel.style.display = 'flex';

    // GPS Modal за admin и firefighter
    const role = document.body.dataset.role || '';
    if (role === 'firefighter' || role === 'admin') {
        setTimeout(() => showGpsModal(lat, lon), 200);
    }

    // Обнови hint в teams панела
    const hint = document.getElementById('teamsHint');
    const inc  = (window.incData || []).find(x => String(x.id) === String(id));
    if (hint && inc) {
        hint.innerHTML = `✅ Избран: <strong style="color:var(--primary)">${esc(inc.title)}</strong>`;
        hint.style.color = 'var(--text)';
    }

    loadTasks(id);
    loadChat(id);
    loadPhotos(id);
    loadAssignments(id);

    if (chatInterval) clearInterval(chatInterval);
    chatInterval = setInterval(() => loadChat(id), 8000);
}

// ── GPS Modal — прост, директен ──────────────────────────
function showGpsModal(lat, lon) {
    const gLink = document.getElementById('gpsGoogleLink');
    const wLink = document.getElementById('gpsWazeLink');
    if (gLink) gLink.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
    if (wLink) wLink.href = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
    const modal = document.getElementById('gpsModal');
    if (modal) modal.style.display = 'flex';
}
function closeGpsModal() {
    const modal = document.getElementById('gpsModal');
    if (modal) modal.style.display = 'none';
}

// ── Снимки ────────────────────────────────────────────────
async function loadPhotos(incId) {
    try {
        const r = await fetch(`/incident/${incId}/photos`);
        if (!r.ok) return;
        const photos = await r.json();
        renderPhotos(photos);
    } catch(e) { console.error('loadPhotos', e); }
}

function renderPhotos(photos) {
    const grid = document.getElementById('photoGrid');
    if (!grid) return;
    if (!photos.length) {
        grid.innerHTML = '<p class="empty-hint">Няма снимки</p>';
        return;
    }
    grid.innerHTML = photos.map(p => `
        <div class="photo-item">
            <a href="${p.url}" target="_blank">
                <img src="${p.url}" alt="${esc(p.original)}" loading="lazy">
            </a>
            <span class="photo-meta">${esc(p.uploaded_by)} · ${p.time}</span>
        </div>`).join('');
}

async function uploadPhoto() {
    const input = document.getElementById('photoUploadInput');
    if (!input || !input.files.length || !currentIncidentId) return;
    const formData = new FormData();
    formData.append('photo', input.files[0]);
    try {
        const r = await fetch(`/incident/${currentIncidentId}/upload_photo`, {
            method: 'POST', body: formData
        });
        if (!r.ok) throw r.status;
        const data = await r.json();
        // Добавя снимката без reload
        const grid = document.getElementById('photoGrid');
        const emptyHint = grid.querySelector('.empty-hint');
        if (emptyHint) emptyHint.remove();
        const div = document.createElement('div');
        div.className = 'photo-item';
        div.innerHTML = `
            <a href="${data.url}" target="_blank">
                <img src="${data.url}" alt="${esc(data.original)}" loading="lazy">
            </a>
            <span class="photo-meta">${esc(data.uploaded_by)} · ${data.time}</span>`;
        grid.appendChild(div);
        input.value = '';
        showNotif('📸 Снимката е качена', 'success');
    } catch(e) { showNotif('❌ Грешка при качване', 'error'); }
}

// ── Изпращане на екип към сигнал ──────────────────────────
async function loadAssignments(incId) {
    try {
        const r = await fetch(`/incident/${incId}/assignments`);
        if (!r.ok) return;
        const assignments = await r.json();
        const cont = document.getElementById('assignmentsList');
        if (!cont) return;

        const statusLabel = { dispatched:'🚒 Изпратен', on_scene:'✅ На място', returned:'🔙 Върнат' };

        if (!assignments.length) {
            cont.innerHTML = '<p class="empty-hint">Няма изпратени екипи</p>';
            return;
        }
        cont.innerHTML = assignments.map(a => `
            <div class="assignment-item">
                <div class="assignment-info">
                    <span class="assignment-name">${esc(a.name)}</span>
                    ${a.vehicle ? `<span class="assignment-vehicle">🚒 ${esc(a.vehicle)}</span>` : ''}
                    <span class="assignment-time">от ${esc(a.assigned_by)} · ${a.assigned_at}</span>
                </div>
                <select class="xs-select" onchange="updateAssignmentStatus(${a.id}, this.value)">
                    <option value="dispatched" ${a.status==='dispatched'?'selected':''}>🚒 Изпратен</option>
                    <option value="on_scene"   ${a.status==='on_scene'?'selected':''}>✅ На място</option>
                    <option value="returned"   ${a.status==='returned'?'selected':''}>🔙 Върнат</option>
                </select>
            </div>`).join('');
    } catch(e) { console.error('loadAssignments', e); }
}

// ── Assign Modal — показва списък с активни сигнали ──────
let pendingMemberId   = null;
let pendingMemberName = '';

async function assignMember(memberId, memberName) {
    pendingMemberId   = memberId;
    pendingMemberName = memberName;
    const nameEl = document.getElementById('assignMemberName');
    if (nameEl) nameEl.textContent = memberName;
    const doneEl = document.getElementById('assignDone');
    const listEl = document.getElementById('assignIncidentList');
    if (doneEl) doneEl.style.display = 'none';
    if (listEl) { listEl.style.display = 'flex'; listEl.innerHTML = '<p class="empty-hint">Зарежда...</p>'; }
    const modal = document.getElementById('assignModal');
    if (modal) modal.style.display = 'flex';
    try {
        const r = await fetch('/incidents/list');
        if (!r.ok) throw r.status;
        const incidents = await r.json();
        if (!incidents.length) {
            if (listEl) listEl.innerHTML = '<p class="empty-hint">Няма активни сигнали</p>';
            return;
        }
        if (listEl) listEl.innerHTML = incidents.map(inc => `
            <button onclick="doAssign(${inc.id}, '${esc(inc.title)}')"
                style="width:100%;background:var(--card-bg);border:1px solid var(--border2);
                       border-radius:10px;padding:12px 14px;text-align:left;cursor:pointer;
                       color:var(--text);margin-bottom:2px;transition:all .15s;"
                onmouseover="this.style.borderColor='var(--primary)';this.style.background='rgba(239,68,68,.08)'"
                onmouseout="this.style.borderColor='var(--border2)';this.style.background='var(--card-bg)'">
                <div style="font-weight:700;font-size:13px;">🔥 ${esc(inc.title)}</div>
                ${inc.description ? `<div style="font-size:11px;opacity:.6;margin-top:3px;">${esc(inc.description)}</div>` : ''}
            </button>`).join('');
    } catch(e) {
        if (listEl) listEl.innerHTML = '<p class="empty-hint" style="color:#f87171;">Грешка при зареждане</p>';
    }
}

async function doAssign(incidentId, incidentTitle) {
    if (!pendingMemberId) return;
    const listEl = document.getElementById('assignIncidentList');
    const doneEl = document.getElementById('assignDone');
    const textEl = document.getElementById('assignDoneText');
    if (listEl) listEl.style.display = 'none';
    if (doneEl) doneEl.style.display = 'block';
    try {
        const r    = await fetch(`/incident/${incidentId}/assign`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ member_id: pendingMemberId })
        });
        const data = await r.json();
        if (r.status === 409) {
            if (textEl) textEl.textContent = `${pendingMemberName} вече е изпратен към ${incidentTitle}`;
        } else if (!r.ok) {
            if (textEl) textEl.textContent = 'Грешка: ' + (data.error || r.status);
        } else {
            if (textEl) textEl.textContent = `${pendingMemberName} → ${incidentTitle}`;
            showNotif(`🚒 ${pendingMemberName} изпратен към ${incidentTitle}`, 'success');
            loadMembers();
        }
    } catch(e) {
        if (textEl) textEl.textContent = 'Мрежова грешка';
    }
    setTimeout(closeAssignModal, 2000);
}

function closeAssignModal() {
    const modal  = document.getElementById('assignModal');
    const listEl = document.getElementById('assignIncidentList');
    const doneEl = document.getElementById('assignDone');
    if (modal)  modal.style.display  = 'none';
    if (listEl) { listEl.style.display = 'flex'; listEl.innerHTML = ''; }
    if (doneEl) doneEl.style.display = 'none';
    pendingMemberId = null; pendingMemberName = '';
}

// ── GPS Modal — прост, директен ──────────────────────────
function showGpsModal(lat, lon) {
    const gLink = document.getElementById('gpsGoogleLink');
    const wLink = document.getElementById('gpsWazeLink');
    if (gLink) gLink.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
    if (wLink) wLink.href = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
    const modal = document.getElementById('gpsModal');
    if (modal) modal.style.display = 'flex';
}
function closeGpsModal() {
    const modal = document.getElementById('gpsModal');
    if (modal) modal.style.display = 'none';
}

async function updateAssignmentStatus(assignId, status) {
    try {
        await fetch(`/assignment/${assignId}/status`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ status })
        });
        loadAssignments(currentIncidentId);
        loadMembers();
    } catch(e) { console.error('updateAssignmentStatus', e); }
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
        if (!tasks.length) { list.innerHTML = '<p class="empty-hint">Няма задачи</p>'; return; }
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
    const inp   = document.getElementById('newTaskInput');
    const sel   = document.getElementById('taskType');
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

// ── Global Chat ───────────────────────────────────────────
async function loadGChat() {
    try {
        const r = await fetch('/gchat');
        if (!r.ok) return;
        renderMsgs('gchatMessages', await r.json(), true);
    } catch(e) {}
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
    } catch(e) {}
}

function renderMsgs(boxId, msgs, showRole) {
    const box = document.getElementById(boxId);
    if (!box) return;
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 24;
    if (!msgs.length) { box.innerHTML = '<p class="empty-hint">Няма съобщения</p>'; return; }
    const roleColor = { admin:'#f87171', firefighter:'#fb923c' };
    box.innerHTML = msgs.map(m => `
        <div class="chat-msg">
            <span class="chat-user" style="color:${showRole?(roleColor[m.role]||'#94a3b8'):'var(--primary)'}">
                ${esc(m.user)}${showRole&&m.role?` <em style="font-size:10px;opacity:.6">[${m.role}]</em>`:''}
            </span>
            <span class="chat-time">${m.time}</span>
            <div class="chat-text">${esc(m.text)}</div>
        </div>`).join('');
    if (atBottom) box.scrollTop = box.scrollHeight;
}

// ── Members & Shifts ──────────────────────────────────────
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
            return `
            <div class="member-item ${!m.on_shift?'member-off':''}">
                <span class="member-status-icon">${s.icon}</span>
                <div class="member-info">
                    <span class="member-name">${esc(m.name)}</span>
                    ${m.vehicle?`<span class="member-vehicle">🚒 ${esc(m.vehicle)}</span>`:''}
                    ${m.shift_notes?`<span class="member-note">${esc(m.shift_notes)}</span>`:''}
                </div>
                <div class="member-actions">
                    <span class="member-status-label">${s.label}</span>
                    <div class="member-btns">
                        ${m.on_shift
                            ? `<button class="btn-xs" style="background:var(--amber);color:#fff;"
                                onclick="shiftAction(${m.id},'end','${esc(m.name)}')">⏹ Края</button>`
                            : `<button class="btn-xs btn-green"
                                onclick="shiftAction(${m.id},'start','${esc(m.name)}')">▶ Смяна</button>`
                        }
                        <button class="btn-xs btn-red" title="Изпрати към сигнала"
                            onclick="assignMember(${m.id},'${esc(m.name)}')">🚒 Изпрати</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch(e) { console.error('loadMembers', e); }
}

async function shiftAction(memberId, action, name) {
    try {
        let notes = '';
        if (action === 'start') {
            notes = prompt(`Бележка за смяната на ${name} (незадължително):`) || '';
        }
        const r = await fetch(`/members/${memberId}/shift`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ action, notes })
        });
        if (!r.ok) throw r.status;
        showNotif(action === 'start' ? `▶ ${name} — смяната е започната` : `⏹ ${name} — смяната е приключена`, 'success');
        loadMembers();
    } catch(e) { showNotif('Грешка при смяна', 'error'); }
}

async function addMember() {
    const name = (document.getElementById('newMemberName')?.value||'').trim();
    const vid  = document.getElementById('newMemberVehicle')?.value||'';
    if (!name) return;
    await fetch('/members/add', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, vehicle_id: vid||null, start_shift: true })
    });
    document.getElementById('newMemberName').value = '';
    showNotif(`✅ ${name} добавен и смяната е стартирана`, 'success');
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
                        ${v.water_cap_l?`<span class="vehicle-water">💧 ${v.water_cap_l.toLocaleString()} л</span>`:''}
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
    await fetch(`/vehicles/${id}/status`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status })
    });
}

// ── Admin ────────────────────────────────────────────────
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

// ── Граждански сигнал ─────────────────────────────────────
function openCitizenForm() {
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
    if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
        showNotif('⚠️ Въведи валидни GPS координати', 'error'); return;
    }
    const payload = {
        incident_type:  get('cType')?.value || 'Граждански сигнал',
        description:    get('cDesc')?.value?.trim() || '',
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
            showNotif('✅ Сигналът е изпратен! ID: ' + data.id, 'success');
            ['cLat','cLon','cDesc','cName','cPhone','cInjuredCount'].forEach(id => {
                const el = get(id); if (el) el.value = '';
            });
            ['cInjured','cHazmat'].forEach(id => {
                const el = get(id); if (el) el.checked = false;
            });
            toggle('citizenPanel');
            setTimeout(() => location.reload(), 2000);
        }
    } catch(e) { showNotif('❌ Грешка при изпращане', 'error'); }
}

function toggleInjuredCount() {
    const cb  = document.getElementById('cInjured');
    const row = document.getElementById('injuredCountRow');
    if (row) row.style.display = cb && cb.checked ? 'flex' : 'none';
}

// ── Потушаване на сигнал ──────────────────────────────────
async function resolveIncident() {
    if (!currentIncidentId) return;
    if (!confirm('Маркирай произшествието като ПОТУШЕНО / ПРИКЛЮЧЕНО?')) return;
    try {
        const r = await fetch(`/resolve_incident/${currentIncidentId}`, { method: 'POST' });
        if (!r.ok) throw r.status;
        showNotif('✅ Произшествието е маркирано като приключено', 'success');
        // Обновява визуално в списъка без reload
        const card = document.querySelector(`.glass-item[data-inc-id="${currentIncidentId}"]`);
        if (card) {
            card.classList.add('resolved');
            const badge = card.querySelector('.inc-badge');
            if (badge) { badge.textContent = 'Приключило'; badge.className = 'inc-badge resolved'; }
        }
        // Затваря панела след 1.5 сек
        setTimeout(() => hidePanel(), 1500);
    } catch(e) { showNotif('❌ Грешка', 'error'); }
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

// ── Нотификации ───────────────────────────────────────────
function requestNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default')
        Notification.requestPermission();
}

async function checkNewIncidents() {
    try {
        const r = await fetch(`/incidents/new_since/${notifLastId}`);
        if (!r.ok) return;
        const newIncs = await r.json();
        if (newIncs.length) {
            notifLastId = Math.max(...newIncs.map(i => i.id));
            newIncs.forEach(inc => {
                showNotif(`🚨 НОВ СИГНАЛ: ${inc.title}${inc.source==='citizen'?' (граждански)':''}`, 'alert');
                if ('Notification' in window && Notification.permission === 'granted')
                    new Notification('PHOENIX — Нов сигнал', { body: inc.title });
            });
        }
    } catch(e) {}
}

// ── Toast ─────────────────────────────────────────────────
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

// ── DB Viewer ─────────────────────────────────────────────
async function loadDbViewer() { renderDbTab('vehicles'); }

async function renderDbTab(tab) {
    const cont = document.getElementById('dbTableCont');
    if (!cont) return;
    const inp = document.getElementById('dbActiveTab');
    if (inp) inp.value = tab;
    document.querySelectorAll('.db-tab-btn').forEach(b =>
        b.classList.toggle('db-tab-active', b.dataset.tab === tab));
    cont.innerHTML = '<p class="empty-hint">Зарежда...</p>';
    try {
        const r = await fetch(`/db_view/${tab}`);
        if (!r.ok) throw r.status;
        const data = await r.json();
        if (!data.rows || !data.rows.length) { cont.innerHTML = '<p class="empty-hint">Няма записи</p>'; return; }
        cont.innerHTML = '<div style="overflow-x:auto;"><table class="db-table"><thead><tr>' +
            data.cols.map(c => `<th>${esc(c)}</th>`).join('') +
            '</tr></thead><tbody>' +
            data.rows.map(row => '<tr>' + row.map(cell => `<td>${esc(cell == null ? '—' : String(cell))}</td>`).join('') + '</tr>').join('') +
            '</tbody></table></div>';
    } catch(e) { cont.innerHTML = `<p class="empty-hint" style="color:#f87171;">Грешка: ${e}</p>`; }
}

// ── Init ─────────────────────────────────────────────────
const ALL_PANELS = [...SIDE_PANELS, 'incidentPanel', 'dbPanel'];

window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    setTimeout(() => applyTheme(saved), 900);

    if (typeof anime !== 'undefined')
        anime({ targets:'#sidebar', translateX:[-360,0], duration:1000, easing:'easeOutExpo' });

    buildTemplates();
    loadMembers();
    setInterval(loadMembers, 30000);

    requestNotifPermission();
    if (window.incData && window.incData.length)
        notifLastId = Math.max(...window.incData.map(i => i.id));
    setInterval(checkNewIncidents, 15000);

    // stopPropagation на всички панели
    ALL_PANELS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', e => e.stopPropagation());
    });

    // Затваряне на GPS и Assign modal при клик извън тях
    document.getElementById('gpsModal')?.addEventListener('click', closeGpsModal);
    document.getElementById('assignModal')?.addEventListener('click', closeAssignModal);
});