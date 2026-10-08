import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Middleware to handle both application/json and text/plain (used by Apps Script callers)
app.use(express.text({ type: ['text/plain', 'text/*', '*/*'] }));

function parseRequestBody(req) {
  if (typeof req.body === 'object' && req.body !== null) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim().length > 0) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

// In-memory employee store
const employees = [
  "Azhari",
  "Budi Santoso",
  "Dewi Lestari",
  "Rudi Hartono",
  "Siti Rahma",
  "Ahmad Fauzi",
  "Nurul Hidayah",
  "Eko Prasetyo",
  "Indah Permata",
  "Bambang Wijaya"
];

// Initial seeded records
const records = [
  {
    nama: "Azhari",
    hari: "Rabu",
    tanggal: "07-10-2026",
    waktuKeluar: "09:15",
    waktuKembali: "11:45",
    keterangan: "Koordinasi teknis kegiatan SAKERNAS ke BPS Kota Pontianak",
    timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
    sessionId: "init-session-1"
  },
  {
    nama: "Budi Santoso",
    hari: "Selasa",
    tanggal: "06-10-2026",
    waktuKeluar: "13:30",
    waktuKembali: "15:20",
    keterangan: "Rapat koordinasi Tim Diseminasi Statistik Daerah",
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
    sessionId: "init-session-2"
  },
  {
    nama: "Dewi Lestari",
    hari: "Senin",
    tanggal: "05-10-2026",
    waktuKeluar: "10:00",
    waktuKembali: "12:15",
    keterangan: "Pengambilan sampel survei harga konsumen pasar Flamboyan",
    timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
    sessionId: "init-session-3"
  }
];

function hitungDurasiMenit(keluar, kembali) {
  try {
    const kParts = keluar.split(':');
    const bParts = kembali.split(':');
    if (kParts.length >= 2 && bParts.length >= 2) {
      const kMin = parseInt(kParts[0], 10) * 60 + parseInt(kParts[1], 10);
      const bMin = parseInt(bParts[0], 10) * 60 + parseInt(bParts[1], 10);
      let diff = bMin - kMin;
      if (diff < 0) diff += 24 * 60; // handling lewat tengah malam
      return diff;
    }
  } catch {}
  return null;
}

function formatDurasi(menit) {
  if (menit === null || menit < 0) return "-";
  const jam = Math.floor(menit / 60);
  const sisaMenit = menit % 60;
  if (jam > 0) {
    return `${jam} jam ${sisaMenit} menit`;
  }
  return `${sisaMenit} menit`;
}

function handleApiAction(payload) {
  const action = payload.action;

  switch (action) {
    case 'getEmployeeNames': {
      return { success: true, data: employees };
    }

    case 'saveRecord': {
      const sessionId = payload.sessionId || crypto.randomUUID();
      const timestamp = new Date().toISOString();

      let formattedDate = payload.tanggal || "-";
      if (formattedDate.includes('-')) {
        const parts = formattedDate.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }

      const newRecord = {
        nama: payload.nama || "-",
        hari: payload.hari || "-",
        tanggal: formattedDate,
        waktuKeluar: payload.waktuKeluar || "-",
        waktuKembali: payload.waktuKembali || "-",
        keterangan: payload.keterangan || "-",
        timestamp: timestamp,
        sessionId: sessionId
      };

      records.unshift(newRecord);

      return {
        success: true,
        message: "Rencana kegiatan berhasil disimpan! Sesi presensi Anda kini aktif.",
        rowIndex: records.length,
        sessionId: sessionId
      };
    }

    case 'updateTime': {
      const { sessionId, nama, type, time } = payload;
      let record = records.find(r => r.sessionId === sessionId && r.nama === nama);
      if (!record && nama) {
        record = records.find(r => r.nama === nama && r.waktuKembali === "-");
      }

      if (!record) {
        return { success: false, message: "Sesi aktif tidak ditemukan di database." };
      }

      if (type === 'keluar') {
        record.waktuKeluar = time;
        return { success: true, message: `Berhasil mencatat Jam Keluar: ${time}` };
      } else {
        record.waktuKembali = time;
        return { success: true, message: `Berhasil mencatat Jam Kembali: ${time}` };
      }
    }

    case 'deleteRecord': {
      const { sessionId, nama } = payload;
      const index = records.findIndex(r => 
        (r.sessionId === sessionId && r.nama === nama) || 
        (nama && r.nama === nama && r.waktuKembali === "-")
      );

      if (index === -1) {
        return { success: false, message: "Sesi aktif tidak ditemukan atau sudah dihapus." };
      }

      records.splice(index, 1);
      return {
        success: true,
        message: "Sesi berhasil dibatalkan dan rencana kegiatan dihapus dari database SIKEMAS secara permanen."
      };
    }

    case 'checkSession': {
      const { sessionId, nama } = payload;
      let record = records.find(r => r.sessionId === sessionId && r.nama === nama);
      if (!record && nama) {
        record = records.find(r => r.nama === nama && r.waktuKembali === "-");
      }

      if (!record) {
        return { found: false };
      }

      return {
        found: true,
        nama: record.nama || "-",
        waktuKeluar: record.waktuKeluar || "-",
        waktuKembali: record.waktuKembali || "-",
        keterangan: record.keterangan || "-"
      };
    }

    case 'getRecords': {
      const employeeName = typeof payload === 'object' && payload.nama ? payload.nama : (typeof payload === 'string' ? payload : "");
      if (!employeeName) {
        return { success: true, data: [] };
      }

      const userRecords = records
        .filter(r => r.nama === employeeName)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .map(r => ({
          nama: r.nama,
          hari: r.hari,
          tanggal: r.tanggal,
          waktuKeluar: r.waktuKeluar,
          waktuKembali: r.waktuKembali,
          keterangan: r.keterangan
        }));

      return { success: true, data: userRecords };
    }

    case 'getAllRecords': {
      const all = records.map(r => {
        const waktuKeluar = String(r.waktuKeluar || "-").trim();
        const waktuKembali = String(r.waktuKembali || "-").trim();

        let durasiMenit = null;
        let durasiTeks = "-";
        if (waktuKeluar !== "-" && waktuKembali !== "-") {
          durasiMenit = hitungDurasiMenit(waktuKeluar, waktuKembali);
          if (durasiMenit !== null) {
            durasiTeks = formatDurasi(durasiMenit);
          }
        } else if (waktuKeluar !== "-" && waktuKembali === "-") {
          durasiTeks = "Sedang Keluar";
        }

        return {
          nama: r.nama,
          hari: r.hari,
          tanggal: r.tanggal,
          waktuKeluar: waktuKeluar,
          waktuKembali: waktuKembali,
          keterangan: r.keterangan,
          timestamp: r.timestamp,
          sessionId: r.sessionId,
          durasiMenit: durasiMenit,
          durasiTeks: durasiTeks
        };
      });

      return { success: true, data: all };
    }

    case 'getSpreadsheetUrl':
      return { success: true, url: "#" };

    case 'getScriptUrl':
      return { success: true, url: "/api" };

    case 'adminForceCompleteSession': {
      const { sessionId, nama, time } = payload;
      let record = records.find(r => r.sessionId === sessionId && r.nama === nama);
      if (!record && nama) {
        record = records.find(r => r.nama === nama && r.waktuKembali === "-");
      }
      if (!record) {
        return { success: false, message: "Sesi aktif tidak ditemukan di database." };
      }
      record.waktuKembali = time;
      return { success: true, message: `Sesi ${nama} berhasil diselesaikan pada pukul ${time}.` };
    }

    case 'adminDeleteRecord': {
      const { sessionId, nama } = payload;
      const index = records.findIndex(r => 
        (r.sessionId === sessionId && r.nama === nama) || 
        (nama && r.nama === nama && r.waktuKembali === "-")
      );
      if (index === -1) {
        return { success: false, message: "Sesi aktif tidak ditemukan atau sudah dihapus." };
      }
      records.splice(index, 1);
      return { success: true, message: "Log berhasil dihapus dari database." };
    }

    default:
      return { success: false, message: "Aksi tidak dikenal: " + action };
  }
}

// Support both /api and root POST
app.post(['/api', '/'], (req, res) => {
  try {
    const payload = parseRequestBody(req);
    const result = handleApiAction(payload);
    res.json(result);
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ success: false, message: err.toString() });
  }
});

app.get('/api', (req, res) => {
  res.json({ success: true, message: "SIKEMAS BPS Kalbar API is running" });
});

// PWA Service Worker with required headers
app.get('/service-worker.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'service-worker.js'));
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SIKEMAS Server running on http://0.0.0.0:${PORT}`);
});
