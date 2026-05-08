// ════════════════════════════════════════════════════════
//  PHOENIX — main.js  v6
// ════════════════════════════════════════════════════════

var currentIncidentId  = null;
var currentIncidentLat = null;
var currentIncidentLon = null;
var chatInterval  = null;
var gchatInterval = null;
var notifLastId   = 0;

function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function getUserRole() { return document.body.dataset.role || ''; }

// ── Toast ─────────────────────────────────────────────────
function showNotif(msg, type) {
    type = type || 'info';
    var cont = document.getElementById('toastContainer');
    if (!cont) return;
    var t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.textContent = msg;
    cont.appendChild(t);
    setTimeout(function() { t.classList.add('toast-show'); }, 10);
    setTimeout(function() { t.classList.remove('toast-show'); setTimeout(function() { t.remove(); }, 400); }, 4500);
}

// ── Панели ────────────────────────────────────────────────
var SIDE_PANELS = ['teamsPanel','adminPanel','vehiclesPanel','gchatPanel','citizenPanel','dbPanel'];

function toggle(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var isOpen = el.style.display === 'flex' || el.style.display === 'block';
    SIDE_PANELS.forEach(function(pid) {
        if (pid !== id) { var p = document.getElementById(pid); if (p) p.style.display = 'none'; }
    });
    if (id === 'addForm') {
        el.style.display = isOpen ? 'none' : 'block';
    } else {
        el.style.display = isOpen ? 'none' : 'flex';
    }
    if (!isOpen) {
        if (id === 'vehiclesPanel') loadVehicles('');
        if (id === 'teamsPanel')   loadMembers();
        if (id === 'gchatPanel')   { loadGChat(); if (!gchatInterval) gchatInterval = setInterval(loadGChat, 8000); }
        if (id === 'dbPanel')      loadDbViewer();
    }
}

function hidePanel() {
    var p = document.getElementById('incidentPanel');
    if (p) p.style.display = 'none';
    if (chatInterval) { clearInterval(chatInterval); chatInterval = null; }
}

// ── Тема ─────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    var ti = document.getElementById('ti');
    function tryMap() {
        if (!window.mapObj || !window.darkLayer || !window.lightLayer) return setTimeout(tryMap, 300);
        if (theme === 'light') {
            try { window.mapObj.removeLayer(window.darkLayer); } catch(e) {}
            window.mapObj.addLayer(window.lightLayer);
            if (ti) ti.className = 'fas fa-moon';
        } else {
            try { window.mapObj.removeLayer(window.lightLayer); } catch(e) {}
            window.mapObj.addLayer(window.darkLayer);
            if (ti) ti.className = 'fas fa-sun';
        }
    }
    tryMap();
}
function toggleT() { applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }

// ── Търсене ───────────────────────────────────────────────
function runSmartSearch() {
    var q = (document.getElementById('smartSearch').value || '').toLowerCase().trim();
    document.querySelectorAll('.glass-item').forEach(function(c) {
        c.style.display = (!q || q.length < 2 || c.innerText.toLowerCase().includes(q)) ? '' : 'none';
    });
    if (q.length >= 2) {
        var m = (window.incData || []).find(function(i) { return i.title.toLowerCase().includes(q); });
        if (m) zoomTo(m.lat, m.lon, m.id);
    }
}

// ── GPS диалог — ФИКСИРАН към body, не зависи от панели ──
function showGpsDialog(lat, lon) {
    var old = document.getElementById('gpsDialog');
    if (old) old.remove();
    var googleUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lon + '&travelmode=driving';
    var wazeUrl   = 'https://waze.com/ul?ll=' + lat + ',' + lon + '&navigate=yes';
    var d = document.createElement('div');
    d.id = 'gpsDialog';
    d.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);' +
        'background:var(--panel-bg);border:1px solid var(--border2);border-radius:14px;padding:16px;' +
        'z-index:99999;min-width:280px;max-width:340px;backdrop-filter:blur(18px);' +
        'box-shadow:0 8px 40px rgba(0,0,0,.5);opacity:0;transition:opacity .25s,transform .25s;';
    d.innerHTML =
        '<div style="font-size:12px;font-weight:700;color:var(--primary);margin-bottom:10px;">' +
            '<i class="fas fa-route"></i>&nbsp; Навигация до сигнала</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
            '<a href="' + googleUrl + '" target="_blank" rel="noopener" ' +
            'style="flex:1;background:#22c55e;color:#fff;padding:9px;border-radius:8px;font-size:12px;font-weight:700;' +
                   'text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:5px;"' +
            ' onclick="document.getElementById(\'gpsDialog\').remove()">' +
            '<i class="fas fa-map-marker-alt"></i> Google Maps</a>' +
            '<a href="' + wazeUrl + '" target="_blank" rel="noopener" ' +
            'style="flex:1;background:#00aff0;color:#fff;padding:9px;border-radius:8px;font-size:12px;font-weight:700;' +
                   'text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:5px;"' +
            ' onclick="document.getElementById(\'gpsDialog\').remove()">' +
            '<i class="fas fa-car"></i> Waze</a>' +
        '</div>' +
        '<button onclick="document.getElementById(\'gpsDialog\').remove()" ' +
        'style="width:100%;background:none;border:1px solid var(--border2);color:var(--muted);' +
               'border-radius:6px;padding:5px;font-size:11px;cursor:pointer;">Затвори</button>';
    document.body.appendChild(d);
    setTimeout(function() { d.style.opacity='1'; d.style.transform='translateX(-50%) translateY(0)'; }, 15);
    setTimeout(function() { var el=document.getElementById('gpsDialog'); if(el) el.remove(); }, 20000);
}

// ── Карта ─────────────────────────────────────────────────
function zoomTo(lat, lon, id) {
    if (!window.mapObj) return;
    window.mapObj.flyTo([lat, lon], 14, { animate: true, duration: 2 });
    var d = (window.incData || []).find(function(x) { return String(x.id) === String(id); });
    if (d && window[d.marker_id]) setTimeout(function() { window[d.marker_id].openPopup(); }, 1800);

    currentIncidentId  = String(id);
    currentIncidentLat = lat;
    currentIncidentLon = lon;

    document.querySelectorAll('.glass-item[data-inc-id]').forEach(function(el) {
        el.classList.toggle('active-incident', String(el.dataset.incId) === currentIncidentId);
    });

    var panel = document.getElementById('incidentPanel');
    if (panel) panel.style.display = 'flex';

    // Hint в teams панела
    var hint = document.getElementById('teamsHint');
    var inc  = (window.incData || []).find(function(x) { return String(x.id) === String(id); });
    if (hint && inc) {
        hint.innerHTML = '✅ Избран: <strong style="color:var(--primary)">' + esc(inc.title) + '</strong>';
        hint.style.color = 'var(--text)';
    }

    // GPS диалог за admin и firefighter
    var role = getUserRole();
    if (role === 'firefighter' || role === 'admin') {
        setTimeout(function() { showGpsDialog(lat, lon); }, 300);
    }

    loadTasks(id);
    loadChat(id);
    loadPhotos(id);
    loadAssignments(id);

    if (chatInterval) clearInterval(chatInterval);
    chatInterval = setInterval(function() { loadChat(id); }, 8000);
}

// ── Потушаване ────────────────────────────────────────────
async function resolveIncident() {
    if (!currentIncidentId) return;
    if (!confirm('Маркирай произшествието като ПОТУШЕНО?')) return;
    try {
        var r = await fetch('/resolve_incident/' + currentIncidentId, { method: 'POST' });
        if (!r.ok) throw r.status;
        showNotif('✅ Произшествието е маркирано като приключено', 'success');
        var card = document.querySelector('.glass-item[data-inc-id="' + currentIncidentId + '"]');
        if (card) {
            card.classList.add('resolved');
            var badge = card.querySelector('.inc-badge');
            if (badge) { badge.textContent = 'Приключило'; badge.className = 'inc-badge resolved'; }
        }
        setTimeout(hidePanel, 1500);
    } catch(e) { showNotif('❌ Грешка', 'error'); }
}

// ── Tasks ─────────────────────────────────────────────────
var TYPE_ICONS = { operative:'🔥', logistics:'🚛', admin:'📋' };

async function loadTasks(incId) {
    try {
        var r = await fetch('/tasks/' + incId);
        if (!r.ok) throw r.status;
        var tasks = await r.json();
        var list  = document.getElementById('taskList');
        if (!list) return;
        if (!tasks.length) { list.innerHTML = '<p class="empty-hint">Няма задачи</p>'; return; }
        list.innerHTML = tasks.map(function(t) {
            return '<div class="task-item ' + (t.status==='done'?'task-done':'') + '">' +
                '<span class="task-icon">'+(TYPE_ICONS[t.task_type]||'📌')+'</span>' +
                '<span class="task-title">'+esc(t.title)+(t.assigned_to?' <em>· '+esc(t.assigned_to)+'</em>':'')+'</span>' +
                (t.status!=='done' ? '<button class="btn-xs btn-green" onclick="completeTask('+t.id+')">✓</button>'
                                   : '<span class="badge-done">✓</span>') +
            '</div>';
        }).join('');
    } catch(e) { console.error('loadTasks', e); }
}

async function addTask() {
    var inp = document.getElementById('newTaskInput');
    var sel = document.getElementById('taskType');
    var title = inp ? inp.value.trim() : '';
    if (!title || !currentIncidentId) return;
    try {
        await fetch('/tasks/add', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ incident_id: currentIncidentId, title: title, task_type: sel ? sel.value : 'operative' })
        });
        if (inp) inp.value = '';
        loadTasks(currentIncidentId);
    } catch(e) {}
}

async function completeTask(taskId) {
    try { await fetch('/tasks/'+taskId+'/complete', {method:'POST'}); if (currentIncidentId) loadTasks(currentIncidentId); } catch(e) {}
}

// ── Снимки ────────────────────────────────────────────────
async function loadPhotos(incId) {
    try {
        var r = await fetch('/incident/'+incId+'/photos');
        if (!r.ok) return;
        var photos = await r.json();
        var grid = document.getElementById('photoGrid');
        if (!grid) return;
        if (!photos.length) { grid.innerHTML = '<p class="empty-hint">Няма снимки</p>'; return; }
        grid.innerHTML = photos.map(function(p) {
            return '<div class="photo-item"><a href="'+p.url+'" target="_blank"><img src="'+p.url+'" loading="lazy"></a>' +
                   '<span class="photo-meta">'+esc(p.uploaded_by)+' · '+p.time+'</span></div>';
        }).join('');
    } catch(e) {}
}

async function uploadPhoto() {
    var input = document.getElementById('photoUploadInput');
    if (!input || !input.files.length || !currentIncidentId) return;
    var fd = new FormData();
    fd.append('photo', input.files[0]);
    try {
        var r = await fetch('/incident/'+currentIncidentId+'/upload_photo', {method:'POST', body:fd});
        if (!r.ok) throw r.status;
        var data = await r.json();
        var grid = document.getElementById('photoGrid');
        var hint = grid ? grid.querySelector('.empty-hint') : null;
        if (hint) hint.remove();
        var div = document.createElement('div');
        div.className = 'photo-item';
        div.innerHTML = '<a href="'+data.url+'" target="_blank"><img src="'+data.url+'" loading="lazy"></a>' +
                        '<span class="photo-meta">'+esc(data.uploaded_by)+' · '+data.time+'</span>';
        if (grid) grid.appendChild(div);
        input.value = '';
        showNotif('📸 Снимката е качена', 'success');
    } catch(e) { showNotif('❌ Грешка при качване', 'error'); }
}

// ── Assignments ───────────────────────────────────────────
async function loadAssignments(incId) {
    try {
        var r = await fetch('/incident/'+incId+'/assignments');
        if (!r.ok) return;
        var assignments = await r.json();
        var cont = document.getElementById('assignmentsList');
        if (!cont) return;
        if (!assignments.length) { cont.innerHTML = '<p class="empty-hint">Няма изпратени екипи</p>'; return; }
        cont.innerHTML = assignments.map(function(a) {
            return '<div class="assignment-item">' +
                '<div class="assignment-info">' +
                    '<span class="assignment-name">'+esc(a.name)+'</span>' +
                    (a.vehicle ? '<span class="assignment-vehicle">🚒 '+esc(a.vehicle)+'</span>' : '') +
                    '<span class="assignment-time">'+esc(a.assigned_by)+' · '+a.assigned_at+'</span>' +
                '</div>' +
                '<select class="xs-select" onchange="updateAssignmentStatus('+a.id+',this.value)">' +
                    '<option value="dispatched"'+(a.status==='dispatched'?' selected':'')+'>🚒 Изпратен</option>' +
                    '<option value="on_scene"'+(a.status==='on_scene'?' selected':'')+'>✅ На място</option>' +
                    '<option value="returned"'+(a.status==='returned'?' selected':'')+'>🔙 Върнат</option>' +
                '</select>' +
            '</div>';
        }).join('');
    } catch(e) { console.error('loadAssignments', e); }
}

async function assignMember(memberId, memberName) {
    if (!currentIncidentId) {
        showNotif('⚠️ Първо кликни на произшествие от картата!', 'error');
        var hint = document.getElementById('teamsHint');
        if (hint) {
            hint.innerHTML = '❗ Кликни на сигнал от картата или списъка';
            hint.style.color = '#f87171';
            setTimeout(function() {
                hint.innerHTML = '💡 Избери сигнал от картата, после натисни 🚒 Изпрати';
                hint.style.color = 'var(--muted)';
            }, 3000);
        }
        return;
    }
    try {
        var r = await fetch('/incident/'+currentIncidentId+'/assign', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ member_id: memberId })
        });
        var data = await r.json();
        if (r.status === 409) { showNotif('⚠️ '+memberName+' вече е изпратен', 'error'); return; }
        if (!r.ok) { showNotif('❌ Грешка: '+(data.error||r.status), 'error'); return; }
        showNotif('🚒 '+memberName+' изпратен към сигнала!', 'success');
        var panel = document.getElementById('incidentPanel');
        if (panel) panel.style.display = 'flex';
        loadAssignments(currentIncidentId);
        loadMembers();
    } catch(e) { console.error('assignMember', e); showNotif('❌ Мрежова грешка', 'error'); }
}

async function updateAssignmentStatus(assignId, status) {
    try {
        await fetch('/assignment/'+assignId+'/status', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ status: status })
        });
        loadAssignments(currentIncidentId);
        loadMembers();
    } catch(e) {}
}

// ── Chat ──────────────────────────────────────────────────
var TEMPLATES = [
    '🚒 Пристигнахме на място','🔥 Пожарът е локализиран','💧 Нужна е цистерна',
    '🏥 Има пострадал — нужна е линейка','✅ Произшествието е ликвидирано',
    '⚠️ Обстановката се усложнява','🌬️ Вятърът смени посоката','👥 Нужни са допълнителни екипи',
];

function buildTemplates() {
    var c = document.getElementById('templateButtons');
    if (!c) return;
    c.innerHTML = TEMPLATES.map(function(t) {
        return '<button class="tmpl-btn" onclick="sendMsg('+JSON.stringify(t)+')">'+t+'</button>';
    }).join('');
}

async function loadChat(incId) {
    try { var r = await fetch('/chat/'+incId); if (!r.ok) throw r.status; renderMsgs('chatMessages', await r.json(), false); } catch(e) {}
}

async function sendMsg(text) {
    var inp = document.getElementById('chatInput');
    var msg = text || (inp ? inp.value.trim() : '');
    if (!msg || !currentIncidentId) return;
    try {
        await fetch('/chat/send', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({incident_id:currentIncidentId, text:msg})});
        if (!text && inp) inp.value = '';
        loadChat(currentIncidentId);
    } catch(e) {}
}

async function loadGChat() {
    try { var r = await fetch('/gchat'); if (!r.ok) return; renderMsgs('gchatMessages', await r.json(), true); } catch(e) {}
}

async function sendGChat() {
    var inp = document.getElementById('gchatInput');
    var msg = inp ? inp.value.trim() : '';
    if (!msg) return;
    try {
        await fetch('/gchat/send', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text:msg})});
        if (inp) inp.value = '';
        loadGChat();
    } catch(e) {}
}

function renderMsgs(boxId, msgs, showRole) {
    var box = document.getElementById(boxId);
    if (!box) return;
    var atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 24;
    if (!msgs.length) { box.innerHTML = '<p class="empty-hint">Няма съобщения</p>'; return; }
    var rc = {admin:'#f87171', firefighter:'#fb923c'};
    box.innerHTML = msgs.map(function(m) {
        return '<div class="chat-msg"><span class="chat-user" style="color:'+(showRole?(rc[m.role]||'#94a3b8'):'var(--primary)')+'">'+esc(m.user)+
            (showRole&&m.role?' <em style="font-size:10px;opacity:.6">['+m.role+']</em>':'')+
            '</span><span class="chat-time">'+m.time+'</span><div class="chat-text">'+esc(m.text)+'</div></div>';
    }).join('');
    if (atBottom) box.scrollTop = box.scrollHeight;
}

// ── Members ───────────────────────────────────────────────
var STATUS_INFO = {
    available:  {icon:'🟢',label:'Наличен'}, on_incident:{icon:'🔴',label:'На произшествие'},
    leave:      {icon:'🟡',label:'Отпуск'},  sick:{icon:'⚪',label:'Болничен'},
    off_duty:   {icon:'⬛',label:'Извън смяна'},
};

async function loadMembers() {
    try {
        var r = await fetch('/members');
        if (!r.ok) throw r.status;
        var members = await r.json();
        var cont = document.getElementById('membersList');
        var summary = document.getElementById('memberSummary');
        if (!cont) return;
        var onShift = members.filter(function(m){return m.on_shift;}).length;
        var avail   = members.filter(function(m){return m.on_shift && m.status==='available';}).length;
        if (summary) summary.textContent = 'На смяна: '+onShift+'  |  Налични: '+avail;
        if (!members.length) { cont.innerHTML = '<p class="empty-hint">Няма служители</p>'; return; }
        cont.innerHTML = members.map(function(m) {
            var s = STATUS_INFO[m.status] || {icon:'⚪', label:m.status};
            return '<div class="member-item '+(m.on_shift?'':'member-off')+'">' +
                '<span class="member-status-icon">'+s.icon+'</span>' +
                '<div class="member-info">' +
                    '<span class="member-name">'+esc(m.name)+'</span>' +
                    (m.vehicle?'<span class="member-vehicle">🚒 '+esc(m.vehicle)+'</span>':'') +
                    (m.shift_notes?'<span class="member-note">'+esc(m.shift_notes)+'</span>':'') +
                '</div>' +
                '<div class="member-actions">' +
                    '<span class="member-status-label">'+s.label+'</span>' +
                    '<div class="member-btns">' +
                        (m.on_shift
                            ? '<button class="btn-xs" style="background:var(--amber);color:#fff;" onclick="shiftAction('+m.id+',\'end\',\''+esc(m.name)+'\')">⏹ Края</button>'
                            : '<button class="btn-xs btn-green" onclick="shiftAction('+m.id+',\'start\',\''+esc(m.name)+'\')">▶ Смяна</button>') +
                        '<button class="btn-xs btn-red" onclick="assignMember('+m.id+',\''+esc(m.name)+'\')" title="Изпрати към избрания сигнал">🚒</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    } catch(e) { console.error('loadMembers', e); }
}

async function shiftAction(memberId, action, name) {
    var notes = action==='start' ? (prompt('Бележка за смяната на '+name+' (Enter за пропускане):') || '') : '';
    try {
        var r = await fetch('/members/'+memberId+'/shift', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:action,notes:notes})});
        if (!r.ok) throw r.status;
        showNotif((action==='start'?'▶ ':'⏹ ')+name+(action==='start'?' — смяната е започната':' — смяната е приключена'), 'success');
        loadMembers();
    } catch(e) { showNotif('Грешка при смяна', 'error'); }
}

async function addMember() {
    var name = (document.getElementById('newMemberName')||{value:''}).value.trim();
    var vid  = (document.getElementById('newMemberVehicle')||{value:''}).value;
    if (!name) return;
    await fetch('/members/add', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:name, vehicle_id:vid||null, start_shift:true})});
    document.getElementById('newMemberName').value = '';
    showNotif('✅ '+name+' добавен', 'success');
    loadMembers();
}

// ── Vehicles ──────────────────────────────────────────────
async function loadVehicles(region) {
    var cont = document.getElementById('vehiclesList');
    if (!cont) return;
    cont.innerHTML = '<p class="empty-hint">Зарежда...</p>';
    try {
        var url = region ? '/vehicles?region='+encodeURIComponent(region) : '/vehicles';
        var r   = await fetch(url);
        if (!r.ok) throw r.status;
        var vehicles = await r.json();
        if (!vehicles.length) { cont.innerHTML = '<p class="empty-hint">Няма резултати</p>'; return; }
        var vstat = {available:'🟢', deployed:'🔴', maintenance:'🟡'};
        var regions = [];
        vehicles.forEach(function(v) { if (!regions.includes(v.region)) regions.push(v.region); });
        regions.sort();
        var html = '';
        regions.forEach(function(reg) {
            var rv = vehicles.filter(function(v){return v.region===reg;});
            html += '<div class="vehicle-region-header">'+esc(reg)+' ('+rv.length+')</div>';
            rv.forEach(function(v) {
                html += '<div class="vehicle-item">' +
                    '<span style="font-size:14px;">'+(vstat[v.status]||'⚪')+'</span>' +
                    '<div class="vehicle-info">' +
                        '<span class="vehicle-sign">'+esc(v.call_sign)+'</span>' +
                        '<span class="vehicle-type">'+esc(v.vehicle_type)+(v.model?' · '+esc(v.model):'')+'</span>' +
                        '<span class="vehicle-station">'+esc(v.station)+'</span>' +
                        (v.water_cap_l?'<span class="vehicle-water">💧 '+v.water_cap_l.toLocaleString()+' л</span>':'') +
                    '</div>' +
                    '<select class="xs-select" onchange="updateVehicleStatus('+v.id+',this.value)">' +
                        '<option value="available"'+(v.status==='available'?' selected':'')+'>Наличен</option>' +
                        '<option value="deployed"'+(v.status==='deployed'?' selected':'')+'>Изпратен</option>' +
                        '<option value="maintenance"'+(v.status==='maintenance'?' selected':'')+'>Ремонт</option>' +
                    '</select>' +
                '</div>';
            });
        });
        cont.innerHTML = html;
    } catch(e) { console.error('loadVehicles', e); cont.innerHTML = '<p class="empty-hint" style="color:#f87171;">Грешка при зареждане. Пусни seed_db.py!</p>'; }
}

async function updateVehicleStatus(id, status) {
    try { await fetch('/vehicles/'+id+'/status', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:status})}); } catch(e) {}
}

// ── DB Viewer ─────────────────────────────────────────────
async function loadDbViewer() {
    var active = (document.getElementById('dbActiveTab')||{value:'incidents'}).value || 'incidents';
    renderDbTab(active);
}

async function renderDbTab(tab) {
    var cont = document.getElementById('dbTableCont');
    if (!cont) return;
    var inp = document.getElementById('dbActiveTab');
    if (inp) inp.value = tab;
    document.querySelectorAll('.db-tab-btn').forEach(function(b) {
        b.classList.toggle('db-tab-active', b.dataset.tab === tab);
    });
    cont.innerHTML = '<p class="empty-hint">Зарежда...</p>';
    try {
        var r = await fetch('/db_view/'+tab);
        if (!r.ok) throw r.status;
        var data = await r.json();
        if (!data.rows || !data.rows.length) { cont.innerHTML = '<p class="empty-hint">Няма записи</p>'; return; }
        var html = '<div style="overflow-x:auto;"><table class="db-table"><thead><tr>' +
            data.cols.map(function(c){return '<th>'+esc(c)+'</th>';}).join('') +
            '</tr></thead><tbody>' +
            data.rows.map(function(row){
                return '<tr>'+row.map(function(cell){return '<td>'+esc(cell==null?'—':String(cell))+'</td>';}).join('')+'</tr>';
            }).join('') +
            '</tbody></table></div>';
        cont.innerHTML = html;
    } catch(e) { cont.innerHTML = '<p class="empty-hint" style="color:#f87171;">Грешка: '+e+'</p>'; }
}

// ── Admin ─────────────────────────────────────────────────
async function changeRole(userId, newRole) {
    if (!newRole) return;
    try {
        var r = await fetch('/promote/'+userId, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({role:newRole})});
        if (!r.ok) throw r.status;
        var badge = document.getElementById('rb-'+userId);
        if (badge) { badge.textContent = newRole; badge.className = 'role-badge role-'+newRole; }
        showNotif('✅ Ролята е сменена', 'success');
    } catch(e) { alert('Грешка при смяна на роля'); }
}

// ── Граждански сигнал ─────────────────────────────────────
function openCitizenForm() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            var lf = document.getElementById('cLat'); if(lf) lf.value = pos.coords.latitude.toFixed(6);
            var lo = document.getElementById('cLon'); if(lo) lo.value = pos.coords.longitude.toFixed(6);
        }, function(){});
    }
    toggle('citizenPanel');
}

async function submitCitizenReport() {
    function get(id) { return document.getElementById(id); }
    var lat = parseFloat(get('cLat') ? get('cLat').value : '');
    var lon = parseFloat(get('cLon') ? get('cLon').value : '');
    if (!lat || !lon || isNaN(lat) || isNaN(lon)) { showNotif('⚠️ Въведи GPS координати', 'error'); return; }
    try {
        var r = await fetch('/citizen_report', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                incident_type: get('cType')?get('cType').value:'Граждански сигнал',
                description:   get('cDesc')?get('cDesc').value.trim():'',
                lat:lat, lon:lon,
                injured:       get('cInjured')?get('cInjured').checked:false,
                injured_count: parseInt(get('cInjuredCount')?get('cInjuredCount').value:0)||0,
                hazmat:        get('cHazmat')?get('cHazmat').checked:false,
                reporter_name: get('cName')?get('cName').value.trim():'',
                reporter_phone:get('cPhone')?get('cPhone').value.trim():'',
            })
        });
        var data = await r.json();
        if (data.status==='ok') {
            showNotif('✅ Сигналът е изпратен! ID: '+data.id, 'success');
            toggle('citizenPanel');
            setTimeout(function(){location.reload();}, 2000);
        }
    } catch(e) { showNotif('❌ Грешка', 'error'); }
}

function toggleInjuredCount() {
    var cb  = document.getElementById('cInjured');
    var row = document.getElementById('injuredCountRow');
    if (row) row.style.display = cb&&cb.checked ? 'flex' : 'none';
}

// ── SOS ───────────────────────────────────────────────────
function sendSOS() {
    function send(lat, lon) {
        fetch('/sos', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({lat:lat,lon:lon})})
        .then(function(){showNotif('🆘 SOS изпратен!', 'alert');});
    }
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function(p){send(p.coords.latitude,p.coords.longitude);}, function(){send(null,null);});
    else send(null, null);
}

// ── Нотификации ───────────────────────────────────────────
function requestNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

async function checkNewIncidents() {
    try {
        var r = await fetch('/incidents/new_since/'+notifLastId);
        if (!r.ok) return;
        var newIncs = await r.json();
        if (newIncs.length) {
            notifLastId = Math.max.apply(null, newIncs.map(function(i){return i.id;}));
            newIncs.forEach(function(inc) {
                showNotif('🚨 НОВ СИГНАЛ: '+inc.title+(inc.source==='citizen'?' (граждански)':''), 'alert');
                if ('Notification' in window && Notification.permission==='granted')
                    new Notification('PHOENIX — Нов сигнал', {body:inc.title});
            });
        }
    } catch(e) {}
}

// ── Init ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
    var saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    setTimeout(function() { applyTheme(saved); }, 900);
    if (typeof anime !== 'undefined') anime({targets:'#sidebar', translateX:[-360,0], duration:1000, easing:'easeOutExpo'});
    buildTemplates();
    loadMembers();
    setInterval(loadMembers, 30000);
    requestNotifPermission();
    if (window.incData && window.incData.length)
        notifLastId = Math.max.apply(null, window.incData.map(function(i){return i.id;}));
    setInterval(checkNewIncidents, 15000);
    SIDE_PANELS.concat(['incidentPanel']).forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', function(e){e.stopPropagation();});
    });
});