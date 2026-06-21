// Pequeño wrapper sobre fetch que añade el token de sesión y normaliza errores.
const Api = (() => {
  const BASE = '/api';

  function getToken() {
    return localStorage.getItem('bda_token');
  }

  function setToken(token) {
    if (token) localStorage.setItem('bda_token', token);
    else localStorage.removeItem('bda_token');
  }

  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      throw new Error('No se ha podido contactar con el servidor. Comprueba tu conexión.');
    }

    if (res.status === 204) return null;

    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      // sin cuerpo JSON
    }

    if (!res.ok) {
      if (res.status === 401 && auth) {
        setToken(null);
        window.dispatchEvent(new CustomEvent('bda:session-expired'));
      }
      throw new Error((data && data.error) || 'Ha ocurrido un error inesperado.');
    }

    return data;
  }

  return {
    getToken,
    setToken,
    register: (full_name, username, password) =>
      request('/auth/register', { method: 'POST', body: { full_name, username, password }, auth: false }),
    login: (username, password) =>
      request('/auth/login', { method: 'POST', body: { username, password }, auth: false }),
    me: () => request('/users/me'),
    updateUsername: (username) => request('/users/me', { method: 'PUT', body: { username } }),

    myLeagues: () => request('/leagues/mine'),
    createLeague: (name, description) => request('/leagues', { method: 'POST', body: { name, description } }),
    joinLeague: (invite_code) => request('/leagues/join', { method: 'POST', body: { invite_code } }),
    getLeague: (id) => request(`/leagues/${id}`),
    updateLeague: (id, name, description) => request(`/leagues/${id}`, { method: 'PUT', body: { name, description } }),
    getMembers: (id) => request(`/leagues/${id}/members`),
    getRanking: (id) => request(`/leagues/${id}/ranking`),

    getScoring: (id) => request(`/leagues/${id}/scoring`),
    addScoringItem: (id, name, emoji, points) =>
      request(`/leagues/${id}/scoring`, { method: 'POST', body: { name, emoji, points } }),
    updateScoringItem: (id, itemId, name, emoji, points) =>
      request(`/leagues/${id}/scoring/${itemId}`, { method: 'PUT', body: { name, emoji, points } }),
    deleteScoringItem: (id, itemId) => request(`/leagues/${id}/scoring/${itemId}`, { method: 'DELETE' }),

    getEntries: (id, userId) => request(`/leagues/${id}/entries${userId ? `?user_id=${userId}` : ''}`),
    addEntry: (id, scoring_item_id, quantity) =>
      request(`/leagues/${id}/entries`, { method: 'POST', body: { scoring_item_id, quantity } }),
    updateEntry: (id, entryId, scoring_item_id, quantity) =>
      request(`/leagues/${id}/entries/${entryId}`, { method: 'PUT', body: { scoring_item_id, quantity } }),
    deleteEntry: (id, entryId) => request(`/leagues/${id}/entries/${entryId}`, { method: 'DELETE' }),
  };
})();
