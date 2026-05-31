const fs = require('fs');
const cfg = require('../config');
const out = [];

async function run() {
  const body = ['Jita'];
  const url = cfg.ESI_BASE + '/universe/ids/?language=en';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': cfg.USER_AGENT
    },
    body: JSON.stringify(body)
  });
  out.push('status ' + res.status);
  out.push(await res.text());
  fs.writeFileSync(require('path').join(__dirname, 'test-jita-out.json'), out.join('\n'));
}

run().catch((e) => {
  fs.writeFileSync(require('path').join(__dirname, 'test-jita-out.json'), String(e));
});
