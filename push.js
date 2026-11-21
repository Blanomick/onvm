// ONVM — notifications « push » (même appli fermée)
//
// - Web Push (site / appli installée depuis le navigateur) : protocole
//   standard VAPID + chiffrement aes128gcm, écrit ici sans dépendance.
// - Appli Android : Firebase Cloud Messaging (FCM HTTP v1), activé si la
//   variable FIREBASE_SERVICE_ACCOUNT contient la clé de service Firebase.
//
// Toutes les lignes de la table « notifications » (messages, j'aime,
// commentaires, abonnements…) sont envoyées automatiquement en push.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contact@onvm.org';
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const fromB64url = (str) => Buffer.from(String(str || ''), 'base64url');

let db = null;
let vapid = null; // { publicKey (base64url, 65 octets), privateJwk }
let ready = false;

/* ------------------------------------------------------------------ */
/* Base de données                                                     */
/* ------------------------------------------------------------------ */

async function ensureTables() {
  if (!(await db.schema.hasTable('app_settings'))) {
    await db.schema.createTable('app_settings', (t) => {
      t.text('key').primary();
      t.text('value').notNullable();
    });
  }

  if (!(await db.schema.hasTable('push_subscriptions'))) {
    await db.schema.createTable('push_subscriptions', (t) => {
      t.increments('id').primary();
      t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.text('kind').notNullable(); // 'web' | 'fcm'
      t.text('endpoint').notNullable().unique(); // URL web push ou jeton FCM
      t.text('p256dh');
      t.text('auth');
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updated_at').defaultTo(db.fn.now());
      t.index(['user_id']);
    });
  }

  if (!(await db.schema.hasColumn('notifications', 'pushed_at'))) {
    await db.schema.alterTable('notifications', (t) => {
      t.timestamp('pushed_at');
    });
    // Les anciennes notifications ne doivent pas toutes sonner d'un coup.
    await db('notifications').update({ pushed_at: db.fn.now() });
  }
}

async function loadVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    const pub = fromB64url(process.env.VAPID_PUBLIC_KEY);
    vapid = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateJwk: {
        kty: 'EC',
        crv: 'P-256',
        x: b64url(pub.subarray(1, 33)),
        y: b64url(pub.subarray(33, 65)),
        d: process.env.VAPID_PRIVATE_KEY,
      },
    };
    return;
  }

  // Sinon : clés créées une fois puis gardées en base (stables).
  const row = await db('app_settings').where({ key: 'vapid' }).first();
  if (row) {
    vapid = JSON.parse(row.value);
    return;
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const priv = privateKey.export({ format: 'jwk' });
  const pubJwk = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([
    Buffer.from([0x04]),
    fromB64url(pubJwk.x),
    fromB64url(pubJwk.y),
  ]);

  vapid = { publicKey: b64url(raw), privateJwk: priv };
  await db('app_settings')
    .insert({ key: 'vapid', value: JSON.stringify(vapid) })
    .onConflict('key')
    .ignore();

  const saved = await db('app_settings').where({ key: 'vapid' }).first();
  vapid = JSON.parse(saved.value);
}

/* ------------------------------------------------------------------ */
/* Web Push (RFC 8291 / RFC 8292)                                      */
/* ------------------------------------------------------------------ */

function vapidHeader(endpoint) {
  const audience = new URL(endpoint).origin;
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64url(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: VAPID_SUBJECT,
    })
  );
  const key = crypto.createPrivateKey({ key: vapid.privateJwk, format: 'jwk' });
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `vapid t=${header}.${payload}.${b64url(signature)}, k=${vapid.publicKey}`;
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

function encrypt(subscription, payload) {
  const uaPublic = fromB64url(subscription.p256dh);
  const authSecret = fromB64url(subscription.auth);

  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    uaPublic,
    asPublic,
    Buffer.from([1]),
  ]);
  const ikm = hmac(prkKey, keyInfo);

  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);

  return Buffer.concat([salt, recordSize, Buffer.from([asPublic.length]), asPublic, encrypted]);
}

async function sendWeb(sub, message) {
  const body = encrypt(sub, JSON.stringify(message));
  const response = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidHeader(sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(message.ttl || 86400),
      // « high » : livré tout de suite même téléphone en veille
      // (messages et appels). Le reste peut attendre le réveil.
      Urgency: ['call', 'call-end', 'message'].includes(message.type) ? 'high' : 'normal',
      ...(message.tag ? { Topic: String(message.tag).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}),
    },
    body,
  });

  if (response.status === 404 || response.status === 410) return 'gone';
  if (!response.ok) {
    throw new Error(`Web push ${response.status} ${await response.text().catch(() => '')}`);
  }
  return 'ok';
}

/* ------------------------------------------------------------------ */
/* Firebase Cloud Messaging (appli Android)                            */
/* ------------------------------------------------------------------ */

let firebase = null;
let fcmToken = { value: null, exp: 0 };

function loadFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return;
  try {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const account = JSON.parse(text);
    if (account.project_id && account.client_email && account.private_key) {
      firebase = account;
    }
  } catch (error) {
    console.error('[PUSH] FIREBASE_SERVICE_ACCOUNT illisible :', error.message);
  }
}

async function firebaseAccessToken() {
  if (fcmToken.value && Date.now() < fcmToken.exp) return fcmToken.value;

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: firebase.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    firebase.private_key,
    { algorithm: 'RS256' }
  );

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Jeton Firebase refusé : ${data.error || response.status}`);

  fcmToken = { value: data.access_token, exp: Date.now() + 50 * 60 * 1000 };
  return fcmToken.value;
}

async function sendFcm(sub, message) {
  if (!firebase) return 'skipped';

  const isCall = message.type === 'call';

  // Sur Android la sonnerie du téléphone dure plusieurs secondes :
  // on la relance toutes les 8 s (au lieu de 4) pour ne pas la couper.
  if (isCall && Number(message.ring) > 1 && Number(message.ring) % 2 === 0) return 'skipped';

  const data = Object.fromEntries(
    Object.entries(message).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
  );

  const payload = {
    message: {
      token: sub.endpoint,
      data,
      android: {
        priority: 'high',
        ttl: `${message.ttl || 86400}s`,
        // Fin d'appel : remplace la notification qui sonne (même « tag »),
        // ce qui arrête la sonnerie. « Appel manqué » ou version silencieuse.
        ...(message.type === 'call-end'
          ? {
              notification: {
                title: message.title,
                body: message.body,
                channel_id: message.missed ? 'onvm_messages' : 'onvm_silent',
                tag: message.tag || undefined,
                ...(message.missed ? { sound: 'default' } : {}),
                notification_priority: message.missed ? 'PRIORITY_DEFAULT' : 'PRIORITY_LOW',
                visibility: 'PUBLIC',
              },
            }
          : {
              notification: {
                title: message.title,
                body: message.body,
                // onvm_ring : canal créé par l'appli Android avec la sonnerie
                // du téléphone, au volume de la sonnerie (comme un vrai appel)
                channel_id: isCall ? 'onvm_ring' : 'onvm_messages',
                tag: message.tag || undefined,
                sound: 'default',
                default_vibrate_timings: !isCall,
                ...(isCall
                  ? { vibrate_timings: ['0s', '0.8s', '0.4s', '0.8s', '0.4s', '0.8s'] }
                  : {}),
                notification_priority: isCall ? 'PRIORITY_MAX' : 'PRIORITY_HIGH',
                visibility: 'PUBLIC',
              },
            }),
      },
    },
  };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${firebase.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await firebaseAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (response.ok) return 'ok';
  const text = await response.text().catch(() => '');
  if (response.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text)) return 'gone';
  throw new Error(`FCM ${response.status} ${text.slice(0, 200)}`);
}

/* ------------------------------------------------------------------ */
/* Envoi à un utilisateur                                              */
/* ------------------------------------------------------------------ */

async function sendToUser(userId, message) {
  if (!ready || !userId) return;

  const subs = await db('push_subscriptions').where({ user_id: Number(userId) });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const result =
          sub.kind === 'fcm' ? await sendFcm(sub, message) : await sendWeb(sub, message);
        if (result === 'gone') {
          await db('push_subscriptions').where({ id: sub.id }).del();
        }
      } catch (error) {
        console.warn(`[PUSH] Envoi impossible (${sub.kind}) :`, error.message);
      }
    })
  );
}

/* Jeton signé pour « Refuser » un appel directement depuis la notification */
function declineSignature(callId, userId) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'onvm')
    .update(`decline:${callId}:${userId}`)
    .digest('base64url')
    .slice(0, 32);
}

/* ------------------------------------------------------------------ */
/* Notifications de la table → push                                    */
/* ------------------------------------------------------------------ */

function describe(row) {
  const who = row.actor_username || "Quelqu'un";
  const meta = row.metadata || {};
  const snippet = String(meta.snippet || '').trim();

  switch (row.type) {
    case 'message':
      return {
        title: who,
        body: snippet === '[vocal]' ? '🎤 Message vocal' : snippet === '[media]' ? '📷 Photo ou vidéo' : snippet || 'Nouveau message',
        url: meta.conversation_id ? `/chat/${meta.conversation_id}` : '/conversations',
        tag: meta.conversation_id ? `chat-${meta.conversation_id}` : 'chat',
      };
    case 'like_publication':
      return { title: 'ONVM', body: `${who} a aimé ta publication`, url: '/notifications' };
    case 'comment_publication':
      return { title: 'ONVM', body: `${who} a commenté : ${snippet}`.slice(0, 160), url: '/notifications' };
    case 'retweet_publication':
      return { title: 'ONVM', body: `${who} a partagé ta publication`, url: '/notifications' };
    case 'follow':
      return { title: 'ONVM', body: `${who} s'est abonné(e) à toi`, url: `/profile/${row.actor_id}` };
    case 'like_story':
      return { title: 'ONVM', body: `${who} a aimé ta story`, url: '/notifications' };
    case 'comment_story':
      return { title: 'ONVM', body: `${who} a répondu à ta story`, url: '/notifications' };
    default:
      return { title: 'ONVM', body: `Nouvelle activité de ${who}`, url: '/notifications' };
  }
}

let polling = false;

async function pollNotifications() {
  if (polling || !ready) return;
  polling = true;
  try {
    const { rows } = await db.raw(`
      UPDATE notifications n
         SET pushed_at = NOW()
       WHERE n.id IN (
         SELECT id FROM notifications
          WHERE pushed_at IS NULL
            AND created_at > NOW() - INTERVAL '15 minutes'
          ORDER BY id
          LIMIT 50
          FOR UPDATE SKIP LOCKED
       )
      RETURNING n.id, n.user_id, n.actor_id, n.type, n.metadata
    `);

    if (!rows.length) return;

    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
    const actors = actorIds.length
      ? await db('users').select('id', 'username', 'profilePicture').whereIn('id', actorIds)
      : [];
    const byId = new Map(actors.map((a) => [Number(a.id), a]));

    for (const row of rows) {
      const actor = byId.get(Number(row.actor_id));
      const text = describe({ ...row, actor_username: actor?.username });
      await sendToUser(row.user_id, {
        type: row.type === 'message' ? 'message' : 'activity',
        notificationId: row.id,
        icon: actor?.profilePicture && /^https:/.test(actor.profilePicture) ? actor.profilePicture : undefined,
        ...text,
      });
    }
  } catch (error) {
    console.warn('[PUSH] Lecture des notifications :', error.message);
  } finally {
    polling = false;
  }
}

/* ------------------------------------------------------------------ */
/* Routes /api/push                                                    */
/* ------------------------------------------------------------------ */

function authUser(req) {
  const token = (req.header('Authorization') || '').replace(/^Bearer\s+/i, '');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id ? Number(decoded.id) : null;
  } catch {
    return null;
  }
}

function createRouter(callsApi) {
  const express = require('express');
  const router = express.Router();

  router.get('/config', (req, res) => {
    res.json({
      webPush: Boolean(ready && vapid),
      vapidPublicKey: vapid?.publicKey || null,
      fcm: Boolean(firebase),
    });
  });

  router.post('/subscribe', async (req, res) => {
    const userId = authUser(req);
    if (!userId) return res.status(401).json({ message: 'Reconnecte-toi.' });

    const sub = req.body?.subscription || {};
    const endpoint = String(sub.endpoint || '');
    const p256dh = sub.keys?.p256dh;
    const auth = sub.keys?.auth;

    let url;
    try {
      url = new URL(endpoint);
    } catch {
      url = null;
    }
    if (!url || url.protocol !== 'https:' || !p256dh || !auth) {
      return res.status(400).json({ message: 'Abonnement invalide.' });
    }

    await db('push_subscriptions')
      .insert({ user_id: userId, kind: 'web', endpoint, p256dh, auth, updated_at: db.fn.now() })
      .onConflict('endpoint')
      .merge({ user_id: userId, p256dh, auth, updated_at: db.fn.now() });

    res.json({ ok: true });
  });

  router.post('/register-fcm', async (req, res) => {
    const userId = authUser(req);
    if (!userId) return res.status(401).json({ message: 'Reconnecte-toi.' });

    const token = String(req.body?.token || '').trim();
    if (token.length < 20 || token.length > 4096) {
      return res.status(400).json({ message: 'Jeton invalide.' });
    }

    await db('push_subscriptions')
      .insert({ user_id: userId, kind: 'fcm', endpoint: token, updated_at: db.fn.now() })
      .onConflict('endpoint')
      .merge({ user_id: userId, updated_at: db.fn.now() });

    res.json({ ok: true, fcm: Boolean(firebase) });
  });

  router.post('/unsubscribe', async (req, res) => {
    const endpoint = String(req.body?.endpoint || req.body?.token || '');
    if (endpoint) await db('push_subscriptions').where({ endpoint }).del();
    res.json({ ok: true });
  });

  // « Refuser » depuis la notification (le service worker n'a pas le jeton de session)
  router.post('/call-decline', (req, res) => {
    const { callId, userId, sig } = req.body || {};
    if (!callId || !userId || sig !== declineSignature(callId, userId)) {
      return res.status(403).json({ ok: false });
    }
    callsApi?.decline?.(String(callId), Number(userId));
    res.json({ ok: true });
  });

  // Test : envoie une notification à soi-même
  router.post('/test', async (req, res) => {
    const userId = authUser(req);
    if (!userId) return res.status(401).json({ message: 'Reconnecte-toi.' });
    await sendToUser(userId, {
      type: 'activity',
      title: 'ONVM',
      body: 'Les notifications fonctionnent 🎉',
      url: '/notifications',
      tag: 'test',
    });
    res.json({ ok: true });
  });

  return router;
}

async function init(database) {
  db = database;
  try {
    await ensureTables();
    await loadVapid();
    loadFirebase();
    ready = true;
    setInterval(pollNotifications, 3000).unref?.();
    console.log(
      `[PUSH] Prêt — web push : oui, Android (FCM) : ${firebase ? 'oui' : 'non (FIREBASE_SERVICE_ACCOUNT absent)'}`
    );
  } catch (error) {
    console.error('[PUSH] Initialisation impossible :', error.message);
  }
}

module.exports = { init, sendToUser, createRouter, declineSignature };
