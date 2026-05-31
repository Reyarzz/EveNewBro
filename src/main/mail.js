// In-game mail client (read + send) for the active character.

const cfg = require('../../config');
const auth = require('./auth');
const esi = require('./esi');

async function authFetch(method, pathname, token, body) {
  const res = await fetch(cfg.ESI_BASE + pathname, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': cfg.USER_AGENT,
      Authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ESI ${method} ${pathname} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function requireAccess(charId) {
  const access = await auth.getValidAccess(charId);
  if (!access) throw new Error('Log in and add this character (Account tab).');
  return access;
}

async function labels(charId) {
  const access = await requireAccess(charId);
  const list = await authFetch('GET', `/characters/${access.characterId}/mail/labels/`, access.token);
  return {
    characterId: access.characterId,
    characterName: access.characterName,
    labels: Array.isArray(list) ? list : []
  };
}

async function listMail(charId, labelIds, page) {
  const access = await requireAccess(charId);
  const p = page || 1;
  let path = `/characters/${access.characterId}/mail/?page=${p}`;
  if (labelIds && labelIds.length) {
    labelIds.forEach((lid) => {
      path += `&labels_id=${lid}`;
    });
  }
  const res = await fetch(cfg.ESI_BASE + path, {
    headers: {
      Accept: 'application/json',
      'User-Agent': cfg.USER_AGENT,
      Authorization: `Bearer ${access.token}`
    }
  });
  if (!res.ok) throw new Error(`Mail list -> ${res.status}`);
  const pages = Number(res.headers.get('x-pages')) || 1;
  const mails = await res.json();
  const ids = (mails || []).map((m) => m.from).filter(Boolean);
  const names = await esi.resolveNames(ids).catch(() => ({}));
  const rows = (mails || []).map((m) => ({
    id: m.mail_id,
    subject: m.subject || '(no subject)',
    from: names[m.from] || m.from,
    timestamp: m.timestamp,
    isRead: !!m.is_read,
    labels: m.labels || []
  }));
  return { characterId: access.characterId, page: p, pages, mails: rows };
}

async function readMail(charId, mailId) {
  const access = await requireAccess(charId);
  const mail = await authFetch(
    'GET',
    `/characters/${access.characterId}/mail/${mailId}/`,
    access.token
  );
  const fromIds = [mail.from].filter(Boolean);
  const names = await esi.resolveNames(fromIds).catch(() => ({}));
  return {
    id: mailId,
    subject: mail.subject,
    from: names[mail.from] || mail.from,
    timestamp: mail.timestamp,
    body: mail.body || ''
  };
}

async function sendMail(charId, { recipientId, subject, body }) {
  const access = await requireAccess(charId);
  const payload = {
    approved_cost: 0,
    body: body || '',
    recipients: [{ recipient_id: Number(recipientId), recipient_type: 'character' }],
    subject: subject || '(no subject)'
  };
  await authFetch('POST', `/characters/${access.characterId}/mail/`, access.token, payload);
  return { ok: true };
}

module.exports = { labels, listMail, readMail, sendMail };
