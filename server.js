import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbxVVl2X7Xjt3SE8G1-xgpofjKCYEfG7eMuRWFlKAP_cKz7fN7AffUy6_LVdscT1DwcdYw/exec';

app.use(cors());
app.use(express.json());
app.use(express.text({ type: ['text/plain', 'text/*', '*/*'] }));

function parseRequestBody(req) {
  if (typeof req.body === 'object' && req.body !== null) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim().length > 0) {
    try {
      return JSON.parse(req.body);
    } catch {
      return req.body;
    }
  }
  return {};
}

// Support both /api and root POST - forwards to Google Apps Script / Google Sheets
app.post(['/api', '/'], async (req, res) => {
  try {
    const payload = parseRequestBody(req);

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
      redirect: 'follow'
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        message: `Google Apps Script returned status ${response.status}`,
        details: errorText
      });
    }

    const result = await response.json();
    res.json(result);
  } catch (err) {
    console.error('API Proxy Error:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal terhubung ke database spreadsheet: ' + err.message
    });
  }
});

app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: "SIKEMAS BPS Kalbar API is running",
    targetDatabase: APPS_SCRIPT_URL ? "connected" : "not configured"
  });
});

// PWA Service Worker with required headers
app.get(['/sw.js', '/service-worker.js'], (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const targetFile = req.path === '/service-worker.js' ? 'service-worker.js' : 'sw.js';
  res.sendFile(path.join(__dirname, targetFile));
});

// PWA Manifests with proper MIME types
app.get(['/manifest.webmanifest', '/manifest.json'], (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, 'manifest.webmanifest'));
});

// Offline page
app.get('/offline.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'offline.html'));
});

// Serve static frontend files
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.webmanifest')) {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    }
  }
}));

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Run server when started directly
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SIKEMAS Server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
