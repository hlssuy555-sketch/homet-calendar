/* 아침 7시 홈트 달력 — app.js */
(function () {
  'use strict';

  var WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var WEEKDAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];
  var STORAGE_KEY = 'homet.calendar.v1';

  var DATA = null;
  var local = { records: {} };          // 이 기기에서 직접 체크한 기록 (data.json보다 우선)
  var view = { year: 2026, month: 11 }; // 달력에 보이는 달
  var selectedKey = null;
  var deferredPrompt = null;

  var todayDate = new Date();
  var todayKey = keyOf(todayDate.getFullYear(), todayDate.getMonth() + 1, todayDate.getDate());

  /* ---------- 작은 도우미들 ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function keyOf(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function keyOfDate(dt) { return keyOf(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); }
  function dateFromKey(k) {
    var p = k.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function weekdayKey(dt) { return WEEKDAY_KEYS[(dt.getDay() + 6) % 7]; }
  function $(id) { return document.getElementById(id); }

  /* ---------- 저장소 ---------- */
  function loadLocal() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && obj.records && typeof obj.records === 'object') {
        local.records = obj.records;
      }
    } catch (e) { /* 저장소를 못 읽어도 앱은 동작 */ }
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, records: local.records })); } catch (e) {}
  }

  function serverRecords() { return (DATA && DATA.records) || {}; }

  /** data.json 기록 + 이 기기 기록 병합 (기기 기록이 우선) */
  function allRecords() {
    var out = {};
    var k;
    var s = serverRecords();
    for (k in s) { if (Object.prototype.hasOwnProperty.call(s, k)) out[k] = s[k]; }
    for (k in local.records) {
      if (!Object.prototype.hasOwnProperty.call(local.records, k)) continue;
      var lr = local.records[k];
      if (lr && (lr.status === 'none' || lr.status === null)) delete out[k];
      else out[k] = lr;
    }
    return out;
  }

  function recordFor(k) {
    var recs = allRecords();
    return Object.prototype.hasOwnProperty.call(recs, k) ? recs[k] : null;
  }

  function setLocalRecord(k, rec) {
    local.records[k] = rec;
    saveLocal();
  }

  /* ---------- 날짜 정보 ---------- */
  var PHASE_BW_LABEL = '1~2주 차 · 맨몸 적응';
  var PHASE_EQ_LABEL = '3주 차~ · 기구 루틴';

  function isBodyweightPhase(k) {
    return !!(DATA && DATA.bodyweight_only_until && k && k <= DATA.bodyweight_only_until);
  }

  function phaseInfo(k) {
    var bw = isBodyweightPhase(k);
    return {
      key: bw ? 'bodyweight' : 'equipment',
      label: bw ? PHASE_BW_LABEL : PHASE_EQ_LABEL
    };
  }

  function shortDate(k) {
    var p = String(k || '').split('-');
    if (p.length < 3) return k || '';
    return Number(p[1]) + '/' + Number(p[2]);
  }

  function planInfoFor(dt) {
    var k = keyOfDate(dt);
    var wk = weekdayKey(dt);
    var planKey = (DATA.weekly_menu && DATA.weekly_menu[wk]) || 'rest';
    var phase = phaseInfo(k);
    var source = (phase.key === 'bodyweight' && DATA.bodyweight_menus) ? DATA.bodyweight_menus : DATA.menus;
    var menu = (source && source[planKey]) || null;
    return {
      weekday: wk,
      weekdayName: WEEKDAY_NAMES[(dt.getDay() + 6) % 7],
      planKey: planKey,
      planLabel: (DATA.weekly_plan && DATA.weekly_plan[wk]) || (menu ? menu.title : '휴식'),
      menu: menu,
      phase: phase.key,
      phaseLabel: phase.label,
      short: (DATA.menu_labels && DATA.menu_labels[planKey]) || null
    };
  }

  function isBeforeStart(k) {
    return !!(DATA && DATA.start_date && k < DATA.start_date);
  }

  /** status: done | rest | skipped | inprogress | none */
  function statusOf(k, rec) {
    if (!rec || !rec.status || rec.status === 'none') return 'none';
    return rec.status;
  }

  function statusBadge(k, rec, plan) {
    var st = statusOf(k, rec);
    if (st === 'done') return { text: '완료', cls: 'badge-done', cell: 'is-done' };
    if (st === 'rest') return { text: '휴식', cls: 'badge-rest', cell: 'is-rest' };
    if (st === 'skipped') return { text: '미실시', cls: '', cell: 'is-skipped' };
    if (st === 'inprogress') return { text: '진행', cls: 'badge-plan', cell: 'is-progress' };
    if (k === todayKey) return { text: '오늘', cls: 'badge-today', cell: isBeforeStart(k) ? 'is-before' : '' };
    if (isBeforeStart(k)) return { text: '', cls: '', cell: 'is-before' };
    // 주말 휴식일은 '예정'으로 보이지 않게 조용히 회색으로만 표시
    if (plan && plan.planKey === 'rest') return { text: '', cls: '', cell: 'is-rest' };
    if (k > todayKey) return { text: '예정', cls: 'badge-plan', cell: 'is-plan' };
    return { text: '미기록', cls: '', cell: '' };
  }

  /* ---------- 통계 ---------- */
  function monthStats(y, m) {
    var recs = allRecords();
    var prefix = y + '-' + pad(m) + '-';
    var done = 0, rest = 0;
    Object.keys(recs).forEach(function (k) {
      if (k.indexOf(prefix) !== 0) return;
      var st = statusOf(k, recs[k]);
      if (st === 'done') done++;
      else if (st === 'rest') rest++;
    });
    return { done: done, rest: rest };
  }

  function computeStreak() {
    var recs = allRecords();
    var cursor = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
    var streak = 0;
    for (var i = 0; i < 180; i++) {
      var k = keyOfDate(cursor);
      if (DATA.start_date && k < DATA.start_date) break;
      var rec = recs[k];
      var st = statusOf(k, rec);
      if (st === 'done') streak++;
      else if (st === 'rest') { /* 휴식일은 연속을 끊지 않음 */ }
      else if (i === 0) { /* 오늘 아직 기록 전이면 어제까지의 연속을 유지 */ }
      else break;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  /* ---------- 달력 ---------- */
  function renderHeader() {
    $('month-label').textContent = view.year + '년 ' + view.month + '월';
    var st = monthStats(view.year, view.month);
    $('stat-done').textContent = st.done;
    $('stat-rest').textContent = st.rest;
    $('stat-streak').textContent = computeStreak();

    var tPhase = phaseInfo(todayKey);
    $('routine-line').textContent = tPhase.label +
      (tPhase.key === 'bodyweight' ? ' (' + shortDate(DATA.bodyweight_only_until) + '까지)' : '');

    var line = $('phase-line');
    if (DATA.bodyweight_only_until) {
      var from = DATA.start_date ? shortDate(DATA.start_date) : '';
      var until = shortDate(DATA.bodyweight_only_until);
      line.hidden = false;
      line.textContent = '맨몸 적응: ' + from + '~' + until + ' · ' + until + ' 이후 기구 투입';
    } else {
      line.hidden = true;
    }
  }

  function cellEl(dt) {
    var k = keyOfDate(dt);
    var inMonth = dt.getMonth() + 1 === view.month;
    var rec = inMonth ? recordFor(k) : null;
    var plan = planInfoFor(dt);
    var badge = inMonth ? statusBadge(k, rec, plan) : { text: '', cls: '', cell: '' };
    var isToday = k === todayKey;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell';
    btn.dataset.date = k;
    btn.setAttribute('role', 'gridcell');
    var col = (dt.getDay() + 6) % 7;
    if (col === 5) btn.classList.add('sat');
    if (col === 6) btn.classList.add('sun');
    if (!inMonth) btn.classList.add('is-outside');
    if (badge.cell) btn.classList.add(badge.cell);
    if (isToday) btn.classList.add('is-today');
    if (k === selectedKey) btn.classList.add('is-selected');

    var parts = [];
    if (inMonth) {
      if (rec && rec.status === 'done' && rec.workout) {
        parts = splitShort(rec.workout);
        btn.classList.add('is-done');
      } else if (rec && (rec.status === 'rest' || rec.status === 'skipped')) {
        parts = ['휴식'];
      } else if (plan.planKey === 'rest') {
        parts = ['휴식'];
      } else {
        parts = plan.short ? plan.short.slice(0, 2) : splitShort(plan.planLabel);
      }
    }

    var label = dt.getMonth() + 1 + '월 ' + dt.getDate() + '일 ' +
      (inMonth && badge.text ? badge.text : '') ;
    btn.setAttribute('aria-label', label);

    var html = '<span class="day-num">' + dt.getDate() + '</span>';
    if (inMonth && badge.text) {
      html += '<span class="badge ' + badge.cls + '">' + badge.text + '</span>';
    } else {
      html += '<span class="badge badge-empty" style="visibility:hidden">·</span>';
    }
    html += '<span class="parts">' + parts.map(function (p) { return '<span>' + escapeHtml(p) + '</span>'; }).join('') + '</span>';
    btn.innerHTML = html;

    btn.addEventListener('click', function () {
      if (!inMonth) {
        view.year = dt.getFullYear();
        view.month = dt.getMonth() + 1;
        renderHeader();
        renderCalendar();
      }
      openSheet(k);
    });

    return btn;
  }

  function splitShort(text) {
    var t = String(text || '').trim();
    if (!t) return [];
    if (t.length <= 2) return [t];
    if (t.indexOf('·') > -1) {
      var parts = t.split('·').filter(function (p) { return p; });
      var lines = [];
      parts.forEach(function (p) {
        if (lines.length && (lines[lines.length - 1] + '·' + p).length <= 5) lines[lines.length - 1] += '·' + p;
        else lines.push(p);
      });
      return lines.slice(0, 2);
    }
    return [t.slice(0, 2)];
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderCalendar() {
    var cal = $('calendar');
    cal.innerHTML = '';
    var first = new Date(view.year, view.month - 1, 1);
    var offset = (first.getDay() + 6) % 7;
    var totalDays = daysInMonth(view.year, view.month);
    var cells = Math.ceil((offset + totalDays) / 7) * 7;
    for (var i = 0; i < cells; i++) {
      var dt = new Date(view.year, view.month - 1, 1 - offset + i);
      cal.appendChild(cellEl(dt));
    }
  }

  /* ---------- 오늘 카드 ---------- */
  function renderTodayCard() {
    var card = $('today-card');
    var dt = dateFromKey(todayKey);
    var plan = planInfoFor(dt);
    var rec = recordFor(todayKey);
    var st = statusOf(todayKey, rec);
    card.hidden = false;

    var title = $('today-title');
    var sub = $('today-sub');
    var btn = $('today-open');

    if (isBeforeStart(todayKey)) {
      title.textContent = (plan.menu ? plan.menu.title : '휴식') + ' — ' + DATA.start_date + ' 시작';
      sub.textContent = '오늘은 시작 전입니다. ' + (plan.menu ? plan.menu.duration : '') + ' 맨몸 코스로 미리 볼 수 있어요.';
      btn.textContent = '이번 주 루틴 보기';
      $('today-phase').hidden = true;
    } else {
      title.textContent = plan.menu ? plan.menu.title : plan.planLabel;
      var stateText = '예정';
      if (st === 'done') stateText = '완료';
      else if (st === 'rest') stateText = '휴식';
      else if (st === 'inprogress') stateText = '진행 중';
      if (plan.planKey === 'rest') {
        sub.textContent = '운동 쉬는 날 · ' + stateText;
        btn.textContent = st === 'done' ? '오늘 기록 보기' : '휴식 안내 보기';
      } else {
        sub.textContent = (plan.menu ? plan.menu.goal + ' · ' + plan.menu.duration : '휴식') + ' · ' + stateText;
        btn.textContent = st === 'done' ? '오늘 기록 보기' : '오늘 운동 보기';
      }
      var phaseChip = $('today-phase');
      phaseChip.hidden = false;
      phaseChip.textContent = plan.phaseLabel;
      phaseChip.className = 'phase-pill ' + (plan.phase === 'bodyweight' ? 'phase-bw' : 'phase-eq');
    }

    btn.onclick = function () { openSheet(todayKey); };
  }

  /* ---------- 상세 시트 ---------- */
  function openSheet(k) {
    selectedKey = k;
    renderSheet();
    var sheet = $('sheet');
    var back = $('sheet-backdrop');
    sheet.hidden = false;
    back.hidden = false;
    requestAnimationFrame(function () {
      sheet.classList.add('show');
      back.classList.add('show');
    });
    renderCalendar();
  }

  function closeSheet() {
    var sheet = $('sheet');
    var back = $('sheet-backdrop');
    sheet.classList.remove('show');
    back.classList.remove('show');
    setTimeout(function () { sheet.hidden = true; back.hidden = true; }, 240);
    renderHeader();
    renderCalendar();
    renderTodayCard();
  }

  function renderSheet() {
    var k = selectedKey;
    var dt = dateFromKey(k);
    var plan = planInfoFor(dt);
    var rec = recordFor(k);
    var st = statusOf(k, rec);

    $('sheet-title').textContent = (dt.getMonth() + 1) + '월 ' + dt.getDate() + '일 (' + plan.weekdayName + ')';
    var dur = plan.menu ? plan.menu.duration : '';
    var goal = plan.menu ? plan.menu.goal : (plan.planKey === 'rest' ? '회복하는 날' : '');
    var subParts = [];
    [(plan.menu ? plan.menu.title : plan.planLabel), goal, dur].forEach(function (part) {
      if (!part) return;
      var dup = subParts.some(function (p) { return p.indexOf(part) > -1 || part.indexOf(p) > -1; });
      if (!dup) subParts.push(part);
    });
    var subText = subParts.join(' · ') +
      (isBeforeStart(k) ? ' · ' + DATA.start_date + ' 시작 전' : '');
    $('sheet-sub').innerHTML =
      '<span class="phase-pill ' + (plan.phase === 'bodyweight' ? 'phase-bw' : 'phase-eq') + '">' +
      escapeHtml(plan.phaseLabel) + '</span> ' + escapeHtml(subText);

    var buttons = document.querySelectorAll('.status-btn');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var target = b.getAttribute('data-status');
      var pressed = false;
      if (target === 'done') pressed = st === 'done' && !(rec && rec.custom);
      else if (target === 'rest') pressed = st === 'rest';
      else if (target === 'other') pressed = st === 'done' && !!(rec && rec.custom);
      b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    }

    var memoWrap = $('memo-wrap');
    var memoInput = $('memo-input');
    if (st === 'done' && rec && rec.custom) {
      memoWrap.hidden = false;
      memoInput.value = rec.workout || '';
    } else {
      memoWrap.hidden = true;
    }

    // 운동 메뉴
    var menu = plan.menu || (DATA.menus ? DATA.menus.rest : null);
    var items = (menu && menu.items) || [];
    $('menu-title').textContent = menu ? (items.length ? menu.title + ' 코스' : menu.title) : '운동';
    var recSets = (rec && rec.sets) || {};
    var list = $('exercise-list');
    list.innerHTML = '';
    var totalSets = 0, doneSets = 0;

    if (!items.length) {
      var restLi = document.createElement('li');
      restLi.className = 'rest-card';
      restLi.innerHTML =
        '<div class="rest-emoji" aria-hidden="true">🌿</div>' +
        '<p class="rest-title">' + escapeHtml(menu && menu.title ? menu.title : '휴식') + '</p>' +
        '<p class="rest-text">' + escapeHtml((menu && menu.note) || '토·일은 운동 쉬는 날이에요. 폭 쉬고 회복하세요!') + '</p>';
      list.appendChild(restLi);
    }

    if (items.length) {
      items.forEach(function (item) {
        totalSets += item.sets;
        var arr = recSets[item.id] || [];
        var count = 0;
        var dotsHtml = '';
        for (var s = 0; s < item.sets; s++) {
          var on = !!arr[s];
          if (on) count++;
          dotsHtml += '<button type="button" class="set-dot' + (on ? ' on' : '') +
            '" data-item="' + escapeHtml(item.id) + '" data-set="' + s + '" aria-pressed="' + (on ? 'true' : 'false') +
            '" aria-label="' + escapeHtml(item.name) + ' ' + (s + 1) + '세트">' + (s + 1) + '</button>';
        }
        doneSets += count;
        var li = document.createElement('li');
        li.className = 'exercise' + (count === item.sets ? ' complete' : '');
        li.innerHTML =
          '<div class="exercise-top"><div>' +
            '<div class="exercise-name">' + escapeHtml(item.name) + '</div>' +
            '<div class="exercise-meta"><b>' + item.sets + '세트</b> × ' + escapeHtml(item.reps) + ' · ' + escapeHtml(item.equipment) + '</div>' +
          '</div></div>' +
          '<div class="set-dots">' + dotsHtml + '</div>' +
          (item.note ? '<p class="exercise-note">' + escapeHtml(item.note) + '</p>' : '');
        list.appendChild(li);
      });
    }

    $('set-progress').textContent = items.length ? (doneSets + '/' + totalSets + ' 세트') : '';

    var note = $('record-note');
    if (st === 'done' && rec && rec.workout) {
      note.hidden = false;
      note.innerHTML = '<b>기록</b> ' + escapeHtml(rec.workout) +
        (rec.memo ? ' · ' + escapeHtml(rec.memo) : '') +
        (rec.updated_at ? '<br><span style="color:#94A3B8">' + escapeHtml(rec.updated_at) + ' 저장</span>' : '');
    } else if (st === 'rest') {
      note.hidden = false;
      note.innerHTML = '<b>휴식</b> 이 날은 회복일로 기록되어 있습니다.';
    } else if (st === 'inprogress') {
      note.hidden = false;
      note.innerHTML = '<b>진행 중</b> 세트를 모두 체크하면 자동으로 완료됩니다.';
    } else {
      note.hidden = true;
    }

    // 세트 체크
    Array.prototype.forEach.call(list.querySelectorAll('.set-dot'), function (dot) {
      dot.addEventListener('click', function () {
        var itemId = dot.getAttribute('data-item');
        var idx = Number(dot.getAttribute('data-set'));
        toggleSet(k, itemId, idx, menu);
      });
    });
  }

  function toggleSet(k, itemId, idx, menu) {
    var rec = JSON.parse(JSON.stringify(recordFor(k) || {}));
    if (!rec.sets) rec.sets = {};
    var arr = rec.sets[itemId] || [];
    arr[idx] = !arr[idx];
    rec.sets[itemId] = arr;

    var total = 0, done = 0;
    if (menu && menu.items) {
      menu.items.forEach(function (item) {
        total += item.sets;
        var a = rec.sets[item.id] || [];
        for (var s = 0; s < item.sets; s++) if (a[s]) done++;
      });
    }
    if (total > 0 && done === total) {
      rec.status = 'done';
      rec.workout = rec.workout || (menu ? menu.title : '');
      rec.custom = false;
      rec.auto = true;
    } else if (rec.status === 'done' && rec.auto) {
      rec.status = 'inprogress';
      rec.auto = false;
    } else if (!rec.status || rec.status === 'none') {
      rec.status = 'inprogress';
    }
    rec.updated_at = stamp();
    setLocalRecord(k, rec);
    renderSheet();
    renderHeader();
    renderCalendar();
  }

  function stamp() {
    var d = new Date();
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function markStatus(status, customWorkout) {
    var k = selectedKey;
    if (!k) return;
    var dt = dateFromKey(k);
    var plan = planInfoFor(dt);
    var rec = JSON.parse(JSON.stringify(recordFor(k) || {}));
    if (!rec.sets) rec.sets = {};
    rec.status = status;
    rec.custom = !!customWorkout;
    if (customWorkout) {
      rec.workout = customWorkout;
    } else if (status === 'done') {
      rec.workout = plan.menu ? plan.menu.title : plan.planLabel;
    } else if (status === 'rest') {
      rec.workout = '휴식';
    }
    rec.updated_at = stamp();
    rec.auto = false;
    setLocalRecord(k, rec);
    renderSheet();
    renderHeader();
    renderCalendar();
    renderTodayCard();
  }

  /* ---------- 이벤트 연결 ---------- */
  function bindEvents() {
    $('prev-month').addEventListener('click', function () {
      view.month--;
      if (view.month < 1) { view.month = 12; view.year--; }
      renderHeader(); renderCalendar();
    });
    $('next-month').addEventListener('click', function () {
      view.month++;
      if (view.month > 12) { view.month = 1; view.year++; }
      renderHeader(); renderCalendar();
    });
    $('today-btn').addEventListener('click', function () {
      view.year = todayDate.getFullYear();
      view.month = todayDate.getMonth() + 1;
      renderHeader(); renderCalendar();
      var el = document.querySelector('.cell[data-date="' + todayKey + '"]');
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });

    $('sheet-close').addEventListener('click', closeSheet);
    $('sheet-backdrop').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('sheet').hidden) closeSheet();
    });

    Array.prototype.forEach.call(document.querySelectorAll('.status-btn'), function (b) {
      b.addEventListener('click', function () {
        var s = b.getAttribute('data-status');
        if (s === 'other') {
          var wrap = $('memo-wrap');
          wrap.hidden = false;
          $('memo-input').focus();
          return;
        }
        markStatus(s === 'rest' ? 'rest' : 'done', null);
      });
    });

    $('memo-save').addEventListener('click', function () {
      var v = $('memo-input').value.trim();
      if (!v) { $('memo-input').focus(); return; }
      markStatus('done', v);
    });
    $('memo-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('memo-save').click(); }
    });

    $('clear-day').addEventListener('click', function () {
      if (!selectedKey) return;
      if (!window.confirm('이 날짜 기록을 지울까요?')) return;
      setLocalRecord(selectedKey, { status: 'none' });
      renderSheet(); renderHeader(); renderCalendar(); renderTodayCard();
    });

    $('reset-btn').addEventListener('click', function () {
      if (!window.confirm('이 기기에 저장한 기록을 모두 초기화할까요?')) return;
      local.records = {};
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      renderSheet(); renderHeader(); renderCalendar(); renderTodayCard();
    });
  }

  /* ---------- 기구 칩 ---------- */
  function renderEquipment() {
    var box = $('equipment-chips');
    box.innerHTML = '';
    var list = (DATA && (DATA.equipment_chips || DATA.equipment)) || [];
    list.forEach(function (name) {
      var span = document.createElement('span');
      span.className = 'chip';
      span.textContent = name;
      box.appendChild(span);
    });
  }

  /* ---------- PWA ---------- */
  function setupPwa() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      $('install-btn').hidden = false;
    });
    $('install-btn').addEventListener('click', function () {
      if (!deferredPrompt) { $('install-btn').hidden = true; return; }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        $('install-btn').hidden = true;
      });
    });
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () {});
      });
    }
  }

  /* ---------- 부팅 ---------- */
  function normalize(data) {
    var fallback = window.__HOMET_FALLBACK__ || null;
    if (!data) data = fallback;
    else if (fallback) {
      var merged = Object.assign({}, fallback, data);
      if (!data.menus) merged.menus = fallback.menus;
      if (!data.weekly_menu) merged.weekly_menu = fallback.weekly_menu;
      data = merged;
    }
    if (!data) {
      data = { start_date: '', routine_name: '아침 7시 홈트', equipment: [], weekly_plan: {}, weekly_menu: {}, menus: {}, records: {} };
    }
    return data;
  }

  /** #d=2026-11-23 처럼 날짜를 지정하면 그 날짜 상세를 바로 연다 (아침 알림 링크용) */
  function openFromHash() {
    var m = /(?:^#|&)d=(\d{4}-\d{2}-\d{2})/.exec(location.hash || '');
    if (!m) return;
    var dt = dateFromKey(m[1]);
    view.year = dt.getFullYear();
    view.month = dt.getMonth() + 1;
    renderHeader();
    renderCalendar();
    openSheet(m[1]);
  }

  function boot() {
    loadLocal();
    var done = function (data) {
      DATA = normalize(data);
      view.year = todayDate.getFullYear();
      view.month = todayDate.getMonth() + 1;
      renderHeader();
      renderCalendar();
      renderTodayCard();
      renderEquipment();
      bindEvents();
      setupPwa();
      $('sync-note').textContent = '기록은 이 기기에 저장됩니다';
      openFromHash();
      window.addEventListener('hashchange', openFromHash);
    };

    if (location.protocol === 'file:') { done(null); return; }

    fetch('./data.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (json) { done(json); })
      .catch(function () { done(null); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
