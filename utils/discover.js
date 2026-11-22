// Hashtags (#), mentions (@), tendances et fil « Pour toi »
const db = require('../db');

// Lettres (accents compris), chiffres et _ ; 2 à 40 caractères
const TAG_RE = /(^|[^\p{L}\p{N}_&/#])#([\p{L}\p{N}_]{2,40})/gu;
const MENTION_RE = /(^|[^\p{L}\p{N}_@/.])@([\p{L}\p{N}_.'’-]{2,40})/gu;

function normalizeTag(tag) {
  return String(tag || '')
    .replace(/^#/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function extractTags(text) {
  const tags = new Set();
  for (const match of String(text || '').matchAll(TAG_RE)) {
    if (!/^\d+$/.test(match[2])) tags.add(normalizeTag(match[2]));
  }
  return [...tags];
}

function extractMentions(text) {
  const names = new Set();
  for (const match of String(text || '').matchAll(MENTION_RE)) {
    names.add(match[2].replace(/[.'’-]+$/, '').toLowerCase());
  }
  return [...names].filter((name) => name.length >= 2);
}

// Prévient les personnes citées avec @pseudo
async function notifyMentions({ text, actorId, publicationId, commentId }) {
  const names = extractMentions(text);
  if (!names.length || !actorId) return;
  try {
    const users = await db('users')
      .select('id', 'username')
      .whereRaw(
        `LOWER(REPLACE(username, ' ', '')) IN (${names.map(() => '?').join(',')})`,
        names
      );
    const actor = await db('users').select('username').where({ id: actorId }).first();

    for (const user of users) {
      if (String(user.id) === String(actorId)) continue;
      await db('notifications')
        .insert({
          user_id: user.id,
          actor_id: actorId,
          type: 'mention',
          entity_type: commentId ? 'comment' : 'publication',
          entity_id: Number(commentId || publicationId),
          metadata: {
            actor_username: actor?.username ?? null,
            publication_id: Number(publicationId),
            snippet: String(text || '').slice(0, 120),
          },
        })
        .onConflict(['type', 'user_id', 'actor_id', 'entity_type', 'entity_id'])
        .ignore();
    }
  } catch (error) {
    console.warn('[MENTIONS] non critique :', error.message);
  }
}

// Tendances : hashtags les plus utilisés récemment (cache 2 min)
let trendCache = { at: 0, data: null };

async function trends(limit = 20) {
  if (trendCache.data && Date.now() - trendCache.at < 120000) {
    return trendCache.data.slice(0, limit);
  }

  const since = (days) => db.raw(`NOW() - INTERVAL '${days} days'`);
  let rows = await db('publications')
    .select('id', 'content', 'created_at')
    .whereNotNull('content')
    .andWhere('content', 'like', '%#%')
    .andWhere('created_at', '>', since(7))
    .orderBy('created_at', 'desc')
    .limit(3000);

  if (rows.length < 5) {
    rows = await db('publications')
      .select('id', 'content', 'created_at')
      .whereNotNull('content')
      .andWhere('content', 'like', '%#%')
      .orderBy('created_at', 'desc')
      .limit(3000);
  }

  const counts = new Map();
  const now = Date.now();
  for (const row of rows) {
    const ageHours = Math.max(0, (now - new Date(row.created_at).getTime()) / 3600000);
    // Les publications récentes comptent plus
    const weight = 1 + Math.max(0, 48 - ageHours) / 48;
    for (const tag of extractTags(row.content)) {
      const current = counts.get(tag) || { tag, posts: 0, score: 0 };
      current.posts += 1;
      current.score += weight;
      counts.set(tag, current);
    }
  }

  const data = [...counts.values()]
    .sort((a, b) => b.score - a.score || b.posts - a.posts)
    .slice(0, 50)
    .map(({ tag, posts }) => ({ tag, posts }));

  trendCache = { at: Date.now(), data };
  return data.slice(0, limit);
}

module.exports = {
  extractTags,
  extractMentions,
  normalizeTag,
  notifyMentions,
  trends,
};
