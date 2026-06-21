// =================================================================
// BORRACHO DEL AÑO — lógica de la interfaz
// =================================================================

const state = {
  user: null,
  leagues: [],
  currentLeague: null,
  scoringItems: [],
  ranking: [],
  history: [],
  rankingSort: { key: 'total_points', dir: 'desc' },
};

const qs = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function initials(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const hhmm = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Hoy, ${hhmm}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Ayer, ${hhmm}`;
  const datePart = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  return `${datePart}, ${hhmm}`;
}

function toast(message, type = 'info') {
  const container = qs('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function showError(elId, err) {
  const el = qs(elId);
  el.textContent = err.message || 'Ha ocurrido un error.';
  el.classList.remove('hidden');
}
function hideError(elId) {
  qs(elId).classList.add('hidden');
}

// -----------------------------------------------------------------
// Navegación entre pantallas
// -----------------------------------------------------------------

function showScreen(id) {
  qsa('.screen').forEach((s) => s.classList.add('hidden'));
  qs(id).classList.remove('hidden');
}

// -----------------------------------------------------------------
// Modales genéricos (admiten apilarse)
// -----------------------------------------------------------------

function openModal(templateId) {
  const tpl = qs(templateId);
  const node = tpl.content.firstElementChild.cloneNode(true);
  qs('modal-root').appendChild(node);

  node.addEventListener('click', (e) => {
    if (e.target === node) closeModal(node);
  });
  qsa('[data-close]', node).forEach((btn) => btn.addEventListener('click', () => closeModal(node)));

  return node;
}

function closeModal(node) {
  node.remove();
}

// -----------------------------------------------------------------
// Arranque
// -----------------------------------------------------------------

async function init() {
  wireAuthScreen();
  wireDashboardScreen();
  wireLeagueScreen();

  window.addEventListener('bda:session-expired', () => {
    toast('Tu sesión ha caducado. Vuelve a iniciar sesión.', 'error');
    state.user = null;
    showScreen('view-auth');
  });

  const token = Api.getToken();
  if (!token) {
    showScreen('view-auth');
    return;
  }

  try {
    state.user = await Api.me();
    await loadDashboard();
    showScreen('view-dashboard');
  } catch (err) {
    Api.setToken(null);
    showScreen('view-auth');
  }
}

// -----------------------------------------------------------------
// Pantalla de autenticación
// -----------------------------------------------------------------

function wireAuthScreen() {
  const tabLogin = qs('tab-login');
  const tabRegister = qs('tab-register');
  const formLogin = qs('form-login');
  const formRegister = qs('form-register');

  function setAuthTab(which) {
    hideError('auth-error');
    const isLogin = which === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabRegister.classList.toggle('active', !isLogin);
    formLogin.classList.toggle('hidden', !isLogin);
    formRegister.classList.toggle('hidden', isLogin);
  }

  tabLogin.addEventListener('click', () => setAuthTab('login'));
  tabRegister.addEventListener('click', () => setAuthTab('register'));

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('auth-error');
    const username = qs('login-username').value.trim();
    const password = qs('login-password').value;
    try {
      const { token, user } = await Api.login(username, password);
      Api.setToken(token);
      state.user = user;
      await loadDashboard();
      showScreen('view-dashboard');
      formLogin.reset();
    } catch (err) {
      showError('auth-error', err);
    }
  });

  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('auth-error');
    const full_name = qs('reg-fullname').value.trim();
    const username = qs('reg-username').value.trim();
    const password = qs('reg-password').value;
    try {
      const { token, user } = await Api.register(full_name, username, password);
      Api.setToken(token);
      state.user = user;
      await loadDashboard();
      showScreen('view-dashboard');
      formRegister.reset();
    } catch (err) {
      showError('auth-error', err);
    }
  });
}

// -----------------------------------------------------------------
// Dashboard (mis ligas)
// -----------------------------------------------------------------

function wireDashboardScreen() {
  qs('btn-logout').addEventListener('click', () => {
    Api.setToken(null);
    state.user = null;
    state.leagues = [];
    showScreen('view-auth');
  });

  qs('btn-edit-username').addEventListener('click', openEditUsernameModal);
  qs('btn-open-create-league').addEventListener('click', openCreateLeagueModal);
  qs('btn-open-join-league').addEventListener('click', openJoinLeagueModal);
}

async function loadDashboard() {
  const [me, leagues] = await Promise.all([Api.me(), Api.myLeagues()]);
  state.user = me;
  state.leagues = leagues;
  renderDashboard();
}

function renderDashboard() {
  qs('dash-avatar').textContent = initials(state.user.full_name);
  qs('dash-fullname').textContent = state.user.full_name;
  qs('dash-username').textContent = `@${state.user.username}`;

  const list = qs('leagues-list');
  if (state.leagues.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="glyph">🍻</span>Aún no estás en ninguna liga.<br>Crea una o pide un código a tus amigos.</div>`;
    return;
  }

  list.innerHTML = state.leagues.map((l) => `
    <div class="league-card" data-league-id="${l.id}">
      <div class="badge-trophy">${l.creator_id === state.user.id ? '👑' : '🏆'}</div>
      <div class="meta">
        <div class="name">${escapeHtml(l.name)}</div>
        <div class="sub">${l.member_count} ${l.member_count === 1 ? 'miembro' : 'miembros'} · ${l.invite_code}</div>
      </div>
      <div class="chevron">›</div>
    </div>
  `).join('');

  qsa('.league-card', list).forEach((card) => {
    card.addEventListener('click', () => {
      const league = state.leagues.find((l) => l.id === Number(card.dataset.leagueId));
      openLeague(league);
    });
  });
}

function openEditUsernameModal() {
  const node = openModal('tpl-modal-edit-username');
  qs('edit-username-input', node).value = state.user.username;
  node.querySelector('#form-edit-username').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErrorIn(node, 'modal-edit-username-error');
    try {
      const updated = await Api.updateUsername(node.querySelector('#edit-username-input').value.trim());
      state.user.username = updated.username;
      renderDashboard();
      closeModal(node);
      toast('Nombre de usuario actualizado.', 'success');
    } catch (err) {
      showErrorIn(node, 'modal-edit-username-error', err);
    }
  });
}

function openCreateLeagueModal() {
  const node = openModal('tpl-modal-create-league');
  node.querySelector('#form-create-league').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErrorIn(node, 'modal-create-league-error');
    const name = node.querySelector('#create-league-name').value.trim();
    const description = node.querySelector('#create-league-desc').value.trim();
    try {
      const league = await Api.createLeague(name, description);
      closeModal(node);
      toast('Liga creada. ¡A por todas!', 'success');
      await loadDashboard();
      openLeague(league);
    } catch (err) {
      showErrorIn(node, 'modal-create-league-error', err);
    }
  });
}

function openJoinLeagueModal() {
  const node = openModal('tpl-modal-join-league');
  node.querySelector('#form-join-league').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErrorIn(node, 'modal-join-league-error');
    const code = node.querySelector('#join-league-code').value.trim();
    try {
      const league = await Api.joinLeague(code);
      closeModal(node);
      toast(`Te has unido a "${league.name}".`, 'success');
      await loadDashboard();
      openLeague(league);
    } catch (err) {
      showErrorIn(node, 'modal-join-league-error', err);
    }
  });
}

// Helpers de error dentro de un modal concreto (puede haber varios apilados)
function showErrorIn(node, elId, err) {
  const el = node.querySelector(`#${elId}`);
  el.textContent = err.message || 'Ha ocurrido un error.';
  el.classList.remove('hidden');
}
function hideErrorIn(node, elId) {
  node.querySelector(`#${elId}`).classList.add('hidden');
}

// -----------------------------------------------------------------
// Vista de liga
// -----------------------------------------------------------------

function wireLeagueScreen() {
  qs('btn-back-dashboard').addEventListener('click', async () => {
    state.currentLeague = null;
    await loadDashboard();
    showScreen('view-dashboard');
  });

  qs('btn-copy-code').addEventListener('click', async () => {
    const code = state.currentLeague.invite_code;
    try {
      await navigator.clipboard.writeText(code);
      toast('Código copiado.', 'success');
    } catch (_) {
      toast(`Código: ${code}`);
    }
  });

  qs('btn-league-admin').addEventListener('click', openEditLeagueModal);
  qs('btn-open-scoring').addEventListener('click', openScoringModal);
  qs('btn-open-member-history').addEventListener('click', openMemberHistoryModal);
  qs('btn-add-score').addEventListener('click', () => openAddScoreModal());

  qs('tab-ranking').addEventListener('click', () => setLeagueTab('ranking'));
  qs('tab-history').addEventListener('click', () => setLeagueTab('history'));
}

function setLeagueTab(which) {
  const isRanking = which === 'ranking';
  qs('tab-ranking').classList.toggle('active', isRanking);
  qs('tab-history').classList.toggle('active', !isRanking);
  qs('panel-ranking').classList.toggle('hidden', !isRanking);
  qs('panel-history').classList.toggle('hidden', isRanking);
}

async function openLeague(league) {
  state.currentLeague = league;
  showScreen('view-league');
  setLeagueTab('ranking');
  renderLeagueHeader();
  qs('panel-ranking').innerHTML = '<div class="loading-spinner"></div>';
  qs('panel-history').innerHTML = '';

  try {
    const [scoring, rankingData, history] = await Promise.all([
      Api.getScoring(league.id),
      Api.getRanking(league.id),
      Api.getEntries(league.id),
    ]);
    state.scoringItems = scoring;
    state.ranking = rankingData.ranking;
    state.history = history;
    state.rankingSort = { key: 'total_points', dir: 'desc' };
    renderRankingPanel();
    renderHistoryPanel();
  } catch (err) {
    qs('panel-ranking').innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderLeagueHeader() {
  const league = state.currentLeague;
  qs('league-name').textContent = league.name;
  qs('league-desc').textContent = league.description || '';
  qs('league-desc').classList.toggle('hidden', !league.description);
  qs('league-invite-code').textContent = league.invite_code;
  qs('btn-league-admin').classList.toggle('hidden', !league.is_admin);
}

async function refreshLeagueData() {
  const league = state.currentLeague;
  const [scoring, rankingData, history] = await Promise.all([
    Api.getScoring(league.id),
    Api.getRanking(league.id),
    Api.getEntries(league.id),
  ]);
  state.scoringItems = scoring;
  state.ranking = rankingData.ranking;
  state.history = history;
  renderRankingPanel();
  renderHistoryPanel();
}

function openEditLeagueModal() {
  const node = openModal('tpl-modal-edit-league');
  node.querySelector('#edit-league-name').value = state.currentLeague.name;
  node.querySelector('#edit-league-desc').value = state.currentLeague.description || '';

  node.querySelector('#form-edit-league').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErrorIn(node, 'modal-edit-league-error');
    const name = node.querySelector('#edit-league-name').value.trim();
    const description = node.querySelector('#edit-league-desc').value.trim();
    try {
      const updated = await Api.updateLeague(state.currentLeague.id, name, description);
      state.currentLeague = updated;
      renderLeagueHeader();
      closeModal(node);
      toast('Liga actualizada.', 'success');
    } catch (err) {
      showErrorIn(node, 'modal-edit-league-error', err);
    }
  });
}

// ---------------- Clasificación (ranking) ----------------

function sortValueFor(row, key) {
  if (key === 'total_points') return row.total_points;
  const itemId = key.split(':')[1];
  return row.items[itemId] || 0;
}

function sortedRanking() {
  const { key, dir } = state.rankingSort;
  const rows = [...state.ranking];
  rows.sort((a, b) => (sortValueFor(b, key) - sortValueFor(a, key)) * (dir === 'asc' ? -1 : 1));
  return rows;
}

function renderRankingPanel() {
  const panel = qs('panel-ranking');
  if (state.ranking.length === 0) {
    panel.innerHTML = `<div class="empty-state"><span class="glyph">🏆</span>Todavía no hay nada que clasificar.</div>`;
    return;
  }

  const items = state.scoringItems;
  const rows = sortedRanking();
  const { key: sortKey, dir: sortDir } = state.rankingSort;
  const arrow = sortDir === 'desc' ? '▼' : '▲';

  const headerCells = [
    `<th class="col-sticky">Jugador</th>`,
    `<th class="sortable${sortKey === 'total_points' ? ' active' : ''}" data-sort-key="total_points">Puntos <span class="arrow">${sortKey === 'total_points' ? arrow : '▼'}</span></th>`,
    ...items.map((it) => {
      const k = `item:${it.id}`;
      return `<th class="sortable${sortKey === k ? ' active' : ''}" data-sort-key="${k}" title="${escapeHtml(it.name)}">${it.emoji} <span class="arrow">${sortKey === k ? arrow : '▼'}</span></th>`;
    }),
  ].join('');

  const bodyRows = rows.map((row, idx) => {
    const itemCells = items.map((it) => {
      const qty = row.items[it.id];
      return `<td class="item-qty-cell">${qty ? qty : '—'}</td>`;
    }).join('');
    return `
      <tr class="${idx === 0 ? 'rank-1' : ''}">
        <td class="col-sticky">
          <div class="player-cell">
            <span class="rank-pos ${idx === 0 ? 'is-first' : ''}">#${idx + 1}</span>
            <div class="mini-avatar">${initials(row.username)}</div>
            <div>${escapeHtml(row.username)}</div>
          </div>
        </td>
        <td><span class="points-pill">${row.total_points}</span></td>
        ${itemCells}
      </tr>`;
  }).join('');

  panel.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;

  qsa('th.sortable', panel).forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sortKey;
      if (state.rankingSort.key === key) {
        state.rankingSort.dir = state.rankingSort.dir === 'desc' ? 'asc' : 'desc';
      } else {
        state.rankingSort = { key, dir: 'desc' };
      }
      renderRankingPanel();
    });
  });
}

// ---------------- Historial ----------------

function buildEntriesTableHtml(entries, { showPlayer = true } = {}) {
  if (entries.length === 0) {
    return `<div class="empty-state"><span class="glyph">🗒️</span>Todavía no hay registros.</div>`;
  }

  const header = `<tr>
    ${showPlayer ? '<th class="col-sticky">Nombre</th>' : ''}
    <th>Elemento</th><th>Cantidad</th><th>Fecha</th><th>Acciones</th>
  </tr>`;

  const rows = entries.map((e) => {
    const canEdit = e.user.id === state.user.id || state.currentLeague.is_admin;
    return `<tr data-entry-id="${e.id}">
      ${showPlayer ? `<td class="col-sticky"><div class="player-cell"><div class="mini-avatar">${initials(e.user.username)}</div>${escapeHtml(e.user.username)}</div></td>` : ''}
      <td>${e.scoring_item.emoji} ${escapeHtml(e.scoring_item.name)}</td>
      <td class="item-qty-cell">${e.quantity}</td>
      <td class="date-cell">${formatDate(e.created_at)}</td>
      <td>
        <div class="entry-actions">
          ${canEdit ? `<button data-action="edit-entry" title="Editar">✏️</button><button data-action="delete-entry" class="danger" title="Eliminar">🗑️</button>` : '—'}
        </div>
      </td>
    </tr>`;
  }).join('');

  return `<div class="table-scroll"><table class="data-table"><thead>${header}</thead><tbody>${rows}</tbody></table></div>`;
}

function wireEntriesTableActions(container, entries, onChanged) {
  qsa('[data-action="edit-entry"]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const entry = entries.find((e) => e.id === Number(tr.dataset.entryId));
      openAddScoreModal(entry, onChanged);
    });
  });
  qsa('[data-action="delete-entry"]', container).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tr = btn.closest('tr');
      const entry = entries.find((e) => e.id === Number(tr.dataset.entryId));
      if (!window.confirm(`¿Eliminar "${entry.scoring_item.name}" de ${entry.user.username}?`)) return;
      try {
        await Api.deleteEntry(state.currentLeague.id, entry.id);
        toast('Registro eliminado.', 'success');
        await onChanged();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function renderHistoryPanel() {
  const panel = qs('panel-history');
  panel.innerHTML = buildEntriesTableHtml(state.history, { showPlayer: true });
  wireEntriesTableActions(panel, state.history, refreshLeagueData);
}

// ---------------- Historial de un integrante ----------------

function openMemberHistoryModal() {
  const node = openModal('tpl-modal-member-history');
  const select = node.querySelector('#member-history-select');
  const content = node.querySelector('#member-history-content');
  content.innerHTML = '<div class="loading-spinner"></div>';

  let members = [];

  async function loadFor(userId) {
    content.innerHTML = '<div class="loading-spinner"></div>';
    try {
      const entries = await Api.getEntries(state.currentLeague.id, userId);
      content.innerHTML = buildEntriesTableHtml(entries, { showPlayer: false });
      wireEntriesTableActions(content, entries, () => loadFor(userId).then(refreshLeagueData));
    } catch (err) {
      content.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }

  Api.getMembers(state.currentLeague.id).then((m) => {
    members = m;
    select.innerHTML = members.map((mem) => `<option value="${mem.id}">${escapeHtml(mem.username)}</option>`).join('');
    const defaultId = members.some((m2) => m2.id === state.user.id) ? state.user.id : members[0].id;
    select.value = defaultId;
    loadFor(defaultId);
  }).catch((err) => {
    content.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  });

  select.addEventListener('change', () => loadFor(Number(select.value)));
}

// ---------------- Sistema de puntuación ----------------

function scoringRowViewHtml(item, isAdmin) {
  return `<div class="scoring-row" data-item-id="${item.id}">
    <div class="emoji">${item.emoji}</div>
    <div class="info"><div class="name">${escapeHtml(item.name)}</div><div class="pts">${item.points} ${item.points === 1 ? 'punto' : 'puntos'}</div></div>
    ${isAdmin ? `<div class="entry-actions">
        <button data-action="edit-scoring" title="Editar">✏️</button>
        <button data-action="delete-scoring" class="danger" title="Eliminar">🗑️</button>
      </div>` : ''}
  </div>`;
}

function scoringRowEditHtml(item) {
  return `<div class="scoring-row" data-item-id="${item.id}">
    <input class="scoring-edit-name" value="${escapeHtml(item.name)}" style="flex:2;min-width:0;background:var(--surface);border:1px solid var(--border);color:var(--cream);border-radius:6px;padding:8px;" />
    <input class="scoring-edit-emoji" value="${escapeHtml(item.emoji)}" style="width:46px;background:var(--surface);border:1px solid var(--border);color:var(--cream);border-radius:6px;padding:8px;text-align:center;" />
    <input class="scoring-edit-points" type="number" step="1" value="${item.points}" style="width:60px;background:var(--surface);border:1px solid var(--border);color:var(--cream);border-radius:6px;padding:8px;" />
    <div class="entry-actions">
      <button data-action="save-scoring" title="Guardar">✅</button>
      <button data-action="cancel-scoring" title="Cancelar">✕</button>
    </div>
  </div>`;
}

function openScoringModal() {
  const node = openModal('tpl-modal-scoring');
  const isAdmin = state.currentLeague.is_admin;
  const listEl = node.querySelector('#scoring-list');

  if (isAdmin) {
    node.querySelector('#scoring-admin-form-wrap').classList.remove('hidden');
    node.querySelector('#form-add-scoring').addEventListener('submit', async (e) => {
      e.preventDefault();
      hideErrorIn(node, 'modal-scoring-error');
      const name = node.querySelector('#scoring-name').value.trim();
      const emoji = node.querySelector('#scoring-emoji').value.trim();
      const points = Number(node.querySelector('#scoring-points').value);
      try {
        const item = await Api.addScoringItem(state.currentLeague.id, name, emoji, points);
        state.scoringItems.push(item);
        state.scoringItems.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
        renderScoringList();
        renderRankingPanel();
        e.target.reset();
        toast('Elemento añadido.', 'success');
      } catch (err) {
        showErrorIn(node, 'modal-scoring-error', err);
      }
    });
  }

  function renderScoringList() {
    if (state.scoringItems.length === 0) {
      listEl.innerHTML = `<div class="empty-state">Aún no hay elementos de puntuación.</div>`;
      return;
    }
    listEl.innerHTML = state.scoringItems.map((it) => scoringRowViewHtml(it, isAdmin)).join('');
    if (!isAdmin) return;

    qsa('[data-action="edit-scoring"]', listEl).forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.scoring-row');
        const item = state.scoringItems.find((it) => it.id === Number(row.dataset.itemId));
        row.outerHTML = scoringRowEditHtml(item);
        wireEditRow(item.id);
      });
    });
    qsa('[data-action="delete-scoring"]', listEl).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.scoring-row');
        const item = state.scoringItems.find((it) => it.id === Number(row.dataset.itemId));
        if (!window.confirm(`¿Eliminar "${item.name}"? Se borrarán también los registros del historial que lo usan.`)) return;
        try {
          await Api.deleteScoringItem(state.currentLeague.id, item.id);
          state.scoringItems = state.scoringItems.filter((it) => it.id !== item.id);
          renderScoringList();
          await refreshLeagueData();
          toast('Elemento eliminado.', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function wireEditRow(itemId) {
    const row = listEl.querySelector(`.scoring-row[data-item-id="${itemId}"]`);
    row.querySelector('[data-action="cancel-scoring"]').addEventListener('click', renderScoringList);
    row.querySelector('[data-action="save-scoring"]').addEventListener('click', async () => {
      const name = row.querySelector('.scoring-edit-name').value.trim();
      const emoji = row.querySelector('.scoring-edit-emoji').value.trim();
      const points = Number(row.querySelector('.scoring-edit-points').value);
      try {
        const updated = await Api.updateScoringItem(state.currentLeague.id, itemId, name, emoji, points);
        const idx = state.scoringItems.findIndex((it) => it.id === itemId);
        state.scoringItems[idx] = updated;
        renderScoringList();
        renderRankingPanel();
        renderHistoryPanel();
        toast('Elemento actualizado.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  renderScoringList();
}

// ---------------- Añadir / editar puntuación ----------------

function openAddScoreModal(editEntry = null, onSaved = refreshLeagueData) {
  const node = openModal('tpl-modal-add-score');
  const select = node.querySelector('#add-score-item');
  const qtyInput = node.querySelector('#add-score-qty');

  if (state.scoringItems.length === 0) {
    node.querySelector('#form-add-score').innerHTML = `<div class="empty-state">Esta liga aún no tiene elementos de puntuación. Pide al admin que añada alguno en "🏷️ Puntuación".</div>`;
    return;
  }

  select.innerHTML = state.scoringItems.map((it) =>
    `<option value="${it.id}">${it.emoji} ${escapeHtml(it.name)} (${it.points} pts)</option>`
  ).join('');

  if (editEntry) {
    node.querySelector('#add-score-title').textContent = 'Editar registro';
    node.querySelector('#add-score-submit').textContent = 'Guardar cambios';
    select.value = editEntry.scoring_item.id;
    qtyInput.value = editEntry.quantity;
  }

  node.querySelector('#qty-minus').addEventListener('click', () => {
    qtyInput.value = Math.max(1, Number(qtyInput.value || 1) - 1);
  });
  node.querySelector('#qty-plus').addEventListener('click', () => {
    qtyInput.value = Number(qtyInput.value || 1) + 1;
  });

  node.querySelector('#form-add-score').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErrorIn(node, 'modal-add-score-error');
    const scoringItemId = Number(select.value);
    const quantity = Number(qtyInput.value);
    try {
      if (editEntry) {
        await Api.updateEntry(state.currentLeague.id, editEntry.id, scoringItemId, quantity);
        toast('Registro actualizado.', 'success');
      } else {
        await Api.addEntry(state.currentLeague.id, scoringItemId, quantity);
        toast('¡Apuntado en el marcador! 🍻', 'success');
      }
      closeModal(node);
      await onSaved();
    } catch (err) {
      showErrorIn(node, 'modal-add-score-error', err);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
