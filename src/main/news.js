// EVE news / patch-notes / dev-blog feed reader.
//
// Fetches a configurable list of RSS/Atom feeds and merges the latest items.
// No dependency: a tolerant regex parser handles both RSS <item> and Atom
// <entry>. Feeds are user-editable (stored in settings); failures are skipped.

const cfg = require('../../config');
const store = require('./store');

const DEFAULT_FEEDS = [
  { name: 'EVE Forums — Latest', url: 'https://forums.eveonline.com/latest.rss' },
  {
    name: 'EVE Patch Notes',
    url: 'https://forums.eveonline.com/c/news-and-announcements/patch-notes/240.rss'
  }
];

function getFeeds() {
  const s = store.loadSettings();
  return Array.isArray(s.newsFeeds) && s.newsFeeds.length ? s.newsFeeds : DEFAULT_FEEDS;
}

function setFeeds(feeds) {
  const clean = (Array.isArray(feeds) ? feeds : [])
    .filter((f) => f && f.url)
    .map((f) => ({ name: f.name || f.url, url: String(f.url).trim() }));
  store.saveSettings({ newsFeeds: clean.length ? clean : DEFAULT_FEEDS });
  return getFeeds();
}

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

function parseFeed(xml, sourceName) {
  const items = [];
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const re = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  const blocks = xml.match(re) || [];
  blocks.forEach((b) => {
    let link = '';
    if (isAtom) {
      const lm = b.match(/<link[^>]*href="([^"]+)"/i);
      link = lm ? lm[1] : '';
    } else {
      link = decode(tag(b, 'link'));
    }
    const dateStr = decode(tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published'));
    const ts = dateStr ? Date.parse(dateStr) : 0;
    items.push({
      title: decode(tag(b, 'title')),
      link,
      date: dateStr,
      ts: Number.isFinite(ts) ? ts : 0,
      summary: decode(tag(b, 'description') || tag(b, 'summary')).slice(0, 240),
      source: sourceName
    });
  });
  return items;
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml', 'User-Agent': cfg.USER_AGENT }
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeed(xml, feed.name);
  } catch (_e) {
    return [];
  }
}

async function getNews() {
  const feeds = getFeeds();
  const lists = await Promise.all(feeds.map(fetchFeed));
  const merged = [].concat(...lists);
  // Dedupe by link, newest first.
  const seen = new Set();
  const out = [];
  merged
    .sort((a, b) => b.ts - a.ts)
    .forEach((it) => {
      const key = it.link || it.title;
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(it);
      }
    });
  return { items: out.slice(0, 40), feeds };
}

module.exports = { getNews, getFeeds, setFeeds };
