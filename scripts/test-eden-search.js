const cfg = require('../config');

async function post(path, body) {
  const res = await fetch(cfg.ESI_BASE + path, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': cfg.USER_AGENT
    },
    body: JSON.stringify(body)
  });
  console.log(path, res.status);
  const text = await res.text();
  console.log(text.slice(0, 500));
}

post('/universe/ids/?language=en', ['Jita']).catch(console.error);
