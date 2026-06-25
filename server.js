import express from 'express';
import { spawn } from 'child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createReadStream, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const app = express();
const PORT = process.env.PORT || 3000;

// Only these hosts are allowed. Anything else is rejected before we ever
// hand a URL to yt-dlp.
const ALLOWED_HOSTS = [
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)youtube-nocookie\.com$/i,
  /(^|\.)soundcloud\.com$/i,
  /(^|\.)mixcloud\.com$/i,
];

function normalizeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.some((re) => re.test(host))) return null;
  return u.toString();
}

// yt-dlp argument sets. Args are passed as an array (never through a shell),
// so the user-supplied URL can't inject anything.
function buildArgs(format, outTemplate, url) {
  const base = [
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--restrict-filenames', // ASCII-safe filenames -> safe Content-Disposition
    '--no-part',
    // Helps avoid "sign in to confirm you're not a bot" gating that YouTube
    // applies to datacenter IPs. Harmless for SoundCloud/Mixcloud.
    '--extractor-args',
    'youtube:player_client=default,android,web_safari',
    '-o',
    outTemplate,
  ];

  if (format === 'video') {
    // Best quality capped at 1080p, merged into a widely-compatible mp4.
    return [
      ...base,
      '-f',
      'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      '--merge-output-format',
      'mp4',
      url,
    ];
  }

  // Audio: pull the best available audio stream and convert to mp3 at the
  // highest quality setting.
  return [
    ...base,
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '0',
    url,
  ];
}

app.use(express.static('public', { maxAge: '1h' }));

app.get('/healthz', (_req, res) => res.type('text').send('ok'));

app.get('/api/download', async (req, res) => {
  const url = normalizeUrl(req.query.url || '');
  const format = req.query.format === 'video' ? 'video' : 'audio';

  if (!url) {
    res
      .status(400)
      .json({ error: 'Please paste a valid YouTube, SoundCloud, or Mixcloud link.' });
    return;
  }

  let tmpDir;
  try {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'dl-'));
  } catch (e) {
    res.status(500).json({ error: 'Server could not create a workspace.' });
    return;
  }

  const outTemplate = path.join(tmpDir, '%(title).180B.%(ext)s');
  const args = buildArgs(format, outTemplate, url);

  const child = spawn('yt-dlp', args, { windowsHide: true });

  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d.toString();
    if (stderr.length > 64 * 1024) stderr = stderr.slice(-64 * 1024);
  });

  // Make sure the temp directory always gets cleaned up.
  const cleanup = () => {
    if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  };
  res.on('close', cleanup);

  child.on('error', () => {
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: 'Downloader is not available on the server (yt-dlp missing).' });
    }
    cleanup();
  });

  child.on('close', async (code) => {
    if (code !== 0) {
      cleanup();
      if (!res.headersSent) {
        const friendly = friendlyError(stderr);
        res.status(502).json({ error: friendly });
      }
      return;
    }

    // Find the produced file in the temp dir.
    let files;
    try {
      files = await readdir(tmpDir);
    } catch {
      files = [];
    }
    const produced = files.find((f) => !f.endsWith('.part'));

    if (!produced) {
      cleanup();
      if (!res.headersSent) {
        res.status(502).json({ error: 'Could not produce a downloadable file.' });
      }
      return;
    }

    const filePath = path.join(tmpDir, produced);
    let size = 0;
    try {
      size = statSync(filePath).size;
    } catch {}

    const contentType =
      format === 'video' ? 'video/mp4' : 'audio/mpeg';

    res.setHeader('Content-Type', contentType);
    if (size) res.setHeader('Content-Length', String(size));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${produced.replace(/"/g, '')}"`,
    );

    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    stream.pipe(res);
  });
});

function friendlyError(stderr) {
  const s = (stderr || '').toLowerCase();
  if (s.includes('private')) return 'That content is private and cannot be downloaded.';
  if (s.includes('sign in') || s.includes('age')) return 'That content requires sign-in or is age-restricted.';
  if (s.includes('not available') || s.includes('unavailable'))
    return 'That content is unavailable.';
  if (s.includes('unsupported url') || s.includes('no video'))
    return 'Could not find anything downloadable at that link.';
  if (s.includes('copyright'))
    return 'That content is blocked (copyright).';
  return 'Could not download that link. Double-check it and try again.';
}

app.listen(PORT, () => {
  console.log(`downydowndown listening on :${PORT}`);
});
