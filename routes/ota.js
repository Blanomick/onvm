// ONVM — mises à jour OTA de l'application Android (Capgo auto-hébergé)
//
// L'appli (plugin @capgo/capacitor-updater) appelle POST /api/ota/update.
// Les versions sont publiées par le workflow GitHub « Publier une mise à
// jour OTA » du dépôt onvm-frontend : chaque version est une Release
// GitHub « ota-x.y.z » contenant onvm-x.y.z.zip et, dans sa description,
// {"version":"x.y.z","checksum":"<sha256>","minNativeCode":1}.

const express = require('express');
const router = express.Router();

const REPO = process.env.OTA_GITHUB_REPO || 'Blanomick/onvm-frontend';
const APP_ID = 'app.onvm.mobile';
const CACHE_MS = 5 * 60 * 1000;

let cache = { at: 0, release: null };

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value || '').trim());
  return match ? match.slice(1).map(Number) : null;
}

function isNewer(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a) return false;
  if (!b) return true; // "builtin" ou version inconnue : on propose la mise à jour
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

async function latestRelease() {
  if (Date.now() - cache.at < CACHE_MS) return cache.release;

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'onvm-ota',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${REPO}/releases?per_page=20`,
    { headers }
  );
  if (!response.ok) {
    throw new Error(`GitHub a répondu ${response.status}`);
  }

  const releases = await response.json();
  let found = null;

  for (const item of releases) {
    if (item.draft || item.prerelease || !String(item.tag_name).startsWith('ota-')) continue;

    let info;
    try {
      info = JSON.parse(String(item.body || '').trim());
    } catch {
      continue;
    }

    const asset = (item.assets || []).find(
      (a) => a.name === `onvm-${info.version}.zip`
    );

    if (
      !asset ||
      !parseVersion(info.version) ||
      !/^[a-f0-9]{64}$/i.test(String(info.checksum || ''))
    ) {
      continue;
    }

    const url = new URL(asset.browser_download_url);
    if (
      url.origin !== 'https://github.com' ||
      !url.pathname.startsWith(`/${REPO}/releases/download/`)
    ) {
      continue;
    }

    found = {
      version: info.version,
      checksum: info.checksum.toLowerCase(),
      minNativeCode: Number(info.minNativeCode) || 1,
      url: url.href,
    };
    break;
  }

  cache = { at: Date.now(), release: found };
  return found;
}

router.post('/update', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const device = req.body || {};

  if (device.app_id !== APP_ID || device.platform !== 'android') {
    return res.json({ message: 'Aucune mise à jour pour cette application.' });
  }

  try {
    const release = await latestRelease();
    const nativeCode = Number(device.version_code) || 0;

    if (
      !release ||
      nativeCode < release.minNativeCode ||
      !isNewer(release.version, device.version_name)
    ) {
      return res.json({ message: 'Aucune nouvelle mise à jour.' });
    }

    return res.json({
      version: release.version,
      url: release.url,
      checksum: release.checksum,
    });
  } catch (error) {
    console.error('[OTA] Vérification impossible :', error.message);
    return res.json({ message: 'Vérification indisponible, réessai plus tard.' });
  }
});

// Pour vérifier facilement dans le navigateur quelle version est en ligne
router.get('/latest', async (req, res) => {
  try {
    res.json((await latestRelease()) || { message: 'Aucune version OTA publiée.' });
  } catch (error) {
    res.status(502).json({ message: error.message });
  }
});

module.exports = router;
