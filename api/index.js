/**
 * Vercel Serverless Function Handler for SIKEMAS API
 * Menghubungkan aplikasi web ke database Google Sheets via Google Apps Script Web App
 */

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxVVl2X7Xjt3SE8G1-xgpofjKCYEfG7eMuRWFlKAP_cKz7fN7AffUy6_LVdscT1DwcdYw/exec';

async function getRequestBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return req.body;
      }
    }
    return req.body;
  }

  // Fallback pembacaan data stream jika body belum di-parse
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(body);
      }
    });
    req.on('error', () => {
      resolve({});
    });
  });
}

export default async function handler(req, res) {
  // CORS Headers untuk mengizinkan akses
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'SIKEMAS BPS Kalbar API is running on Vercel',
      status: 'ready'
    });
  }

  if (req.method === 'POST') {
    try {
      const payload = await getRequestBody(req);
      const targetUrl = process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL;

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: typeof payload === 'string' ? payload : JSON.stringify(payload || {}),
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

      const data = await response.json();
      return res.status(200).json(data);
    } catch (error) {
      console.error('Error forwarding request to database:', error);
      return res.status(500).json({
        success: false,
        message: 'Gagal terhubung ke database Google Sheets: ' + error.message
      });
    }
  }

  return res.status(405).json({
    success: false,
    message: `Method ${req.method} Not Allowed`
  });
}
