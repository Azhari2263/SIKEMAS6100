/**
 * SIKEMAS - Sistem Keterangan Keluar Masuk Pegawai
 * Copyright Tim Umum dan Humas BPS Provinsi Kalimantan Barat @2026
 * * BACKEND LOGIC (Code.gs)
 */

function doGet(e) {
  let page = e && e.parameter && e.parameter.page ? e.parameter.page : 'Index';
  let title = 'SIKEMAS - BPS Prov. Kalbar';
  let templateName = 'Index';
  
  if (page.toLowerCase() === 'monitoring') {
    templateName = 'monitoring';
    title = 'Dashboard Monitoring SIKEMAS - BPS Kalbar';
  }
  
  return HtmlService.createTemplateFromFile(templateName)
    .evaluate()
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

function getSheet() {
  let doc;
  try {
    doc = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) { doc = null; }
  
  if (!doc) {
    const properties = PropertiesService.getScriptProperties();
    let sheetId = properties.getProperty("SPREADSHEET_ID");
    if (sheetId) {
      try { doc = SpreadsheetApp.openById(sheetId); } catch(e) { doc = null; }
    }
    if (!doc) {
      doc = SpreadsheetApp.create("Database SIKEMAS - BPS Kalbar");
      properties.setProperty("SPREADSHEET_ID", doc.getId());
    }
  }
  
  let sheet = doc.getSheetByName("Log_SIKEMAS");
  if (!sheet) {
    sheet = doc.insertSheet("Log_SIKEMAS");
    sheet.appendRow(["Nama Pegawai", "Hari", "Tanggal", "Waktu Keluar", "Waktu Kembali", "Keterangan", "Timestamp"]);
    const headerRange = sheet.getRange("A1:G1");
    headerRange.setFontWeight("bold").setBackground("#005aa9").setFontColor("#ffffff").setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Mengambil daftar nama pegawai dari sheet "User" kolom A secara dinamis
 */
function getEmployeeNames() {
  try {
    let doc;
    try {
      doc = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) { doc = null; }
    
    if (!doc) {
      const properties = PropertiesService.getScriptProperties();
      let sheetId = properties.getProperty("SPREADSHEET_ID");
      if (sheetId) {
        try { doc = SpreadsheetApp.openById(sheetId); } catch(e) { doc = null; }
      }
    }
    
    if (!doc) return { success: true, data: [] };

    let sheet = doc.getSheetByName("User");
    if (!sheet) {
      sheet = doc.insertSheet("User");
      sheet.appendRow(["Nama"]);
      sheet.appendRow(["Azhari"]);
      sheet.appendRow(["Budi Santoso"]);
      sheet.appendRow(["Dewi Lestari"]);
      sheet.getRange("A1").setFontWeight("bold").setBackground("#e2e8f0");
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, data: [] };

    const range = sheet.getRange(2, 1, lastRow - 1, 1);
    const values = range.getValues();

    const names = values
      .map(row => String(row[0]).trim())
      .filter(name => name.length > 0);
      
    return { success: true, data: names };
  } catch (error) {
    Logger.log("Error getEmployeeNames: " + error.toString());
    return { success: false, message: error.toString(), data: [] };
  }
}

// Menyimpan data rencana awal dan mengembalikan Row Index dan Session ID unik
function saveRecord(data) {
  try {
    const sheet = getSheet();
    const timestamp = new Date();
    const sessionId = Utilities.getUuid();
    
    sheet.appendRow([
      data.nama,
      data.hari,
      data.tanggal,
      data.waktuKeluar, // initially "-"
      data.waktuKembali, // initially "-"
      data.keterangan || "-",
      timestamp,
      sessionId
    ]);
    
    const lastRow = sheet.getLastRow();
    return { 
      success: true, 
      message: "Rencana kegiatan berhasil disimpan! Sesi presensi Anda kini aktif.", 
      rowIndex: lastRow,
      sessionId: sessionId
    };
  } catch (error) {
    return { success: false, message: "Gagal menyimpan: " + error.toString() };
  }
}

// Fungsi pembantu mencari baris data sesi aktif secara dinamis dan aman
function findRowBySessionOrEmployee(sessionId, employeeName) {
  try {
    if (!employeeName) return null;
    const sheet = getSheet();
    const values = sheet.getDataRange().getValues();
    
    // 1. Cari berdasarkan Session ID (kolom H / indeks 7)
    if (sessionId) {
      for (let i = 1; i < values.length; i++) {
        if (values[i].length > 7 && String(values[i][7]).trim() === String(sessionId).trim()) {
          // Validasi kecocokan nama pegawai untuk isolasi data
          if (String(values[i][0]).trim() === employeeName.trim()) {
            return i + 1; // 1-indexed row number
          }
        }
      }
    }
    
    // 2. Fallback: Cari baris terakhir milik pegawai tersebut yang belum mencatat Jam Kembali ("-")
    for (let i = values.length - 1; i >= 1; i--) {
      if (String(values[i][0]).trim() === employeeName.trim() && String(values[i][4]).trim() === "-") {
        return i + 1;
      }
    }
  } catch (e) {
    Logger.log("Error findRowBySessionOrEmployee: " + e.toString());
  }
  return null;
}

// Memperbarui waktu keluar/kembali berdasarkan Session ID/Nama secara aman dan instan
function updateTimeSafe(sessionId, employeeName, type, waktu) {
  try {
    const sheet = getSheet();
    const rowIndex = findRowBySessionOrEmployee(sessionId, employeeName);
    
    if (!rowIndex) {
      return { success: false, message: "Sesi aktif tidak ditemukan di database." };
    }
    
    const colIndex = (type === 'keluar') ? 4 : 5; // Kolom D atau E
    sheet.getRange(rowIndex, colIndex).setValue("'" + waktu);
    return { success: true, message: `Berhasil mencatat Jam ${type === 'keluar' ? 'Keluar' : 'Kembali'}: ${waktu}` };
  } catch (error) {
    return { success: false, message: "Gagal memperbarui waktu: " + error.toString() };
  }
}

// Menghapus baris data di database ketika sesi dibatalkan / direset oleh pengguna secara aman
function deleteRecordSafe(sessionId, employeeName) {
  try {
    const sheet = getSheet();
    const rowIndex = findRowBySessionOrEmployee(sessionId, employeeName);
    
    if (!rowIndex) {
      return { success: false, message: "Sesi aktif tidak ditemukan atau sudah dihapus." };
    }
    
    // Melakukan penghapusan baris pada spreadsheet secara fisik
    sheet.deleteRow(rowIndex);
    return { success: true, message: "Sesi berhasil dibatalkan dan rencana kegiatan dihapus dari database SIKEMAS secara permanen." };
  } catch (error) {
    return { success: false, message: "Gagal menghapus data dari database: " + error.toString() };
  }
}

// Memeriksa status sesi aktif pegawai di server secara real-time
function checkSessionActive(sessionId, employeeName) {
  try {
    const rowIndex = findRowBySessionOrEmployee(sessionId, employeeName);
    if (!rowIndex) {
      return { found: false };
    }
    
    const sheet = getSheet();
    const values = sheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
    const displayValues = sheet.getRange(rowIndex, 1, 1, 7).getDisplayValues()[0];
    
    return {
      found: true,
      nama: String(values[0] || "-"),
      waktuKeluar: String(displayValues[3] || "-"),
      waktuKembali: String(displayValues[4] || "-"),
      keterangan: String(values[5] || "-")
    };
  } catch (error) {
    return { found: false, error: error.toString() };
  }
}

// Mengambil riwayat khusus pegawai tertentu (terisolasi) dengan konversi string aman
function getRecordsInternal(employeeName) {
  try {
    if (!employeeName) return [];
    const sheet = getSheet();
    const range = sheet.getDataRange();
    const rows = range.getValues();
    const displayRows = range.getDisplayValues(); // Mengambil representasi teks asli dari layar sheet
    
    if (rows.length <= 1) return [];
    
    const dataRows = [];
    for (let i = 1; i < rows.length; i++) {
      // Filter hanya data milik pegawai yang dipilih
      if (String(rows[i][0]).trim() === employeeName.trim()) {
        dataRows.push({
          rawRow: rows[i],
          displayRow: displayRows[i]
        });
      }
    }
    
    // Urutkan berdasarkan Timestamp descending (terbaru di atas)
    dataRows.sort((a, b) => new Date(b.rawRow[6]) - new Date(a.rawRow[6]));
    
    return dataRows.map(item => {
      const raw = item.rawRow;
      const disp = item.displayRow;
      
      let rawDate = raw[2];
      let formattedDate = rawDate;
      if (rawDate instanceof Date) {
        const d = rawDate.getDate().toString().padStart(2, '0');
        const m = (rawDate.getMonth() + 1).toString().padStart(2, '0');
        const y = rawDate.getFullYear();
        formattedDate = `${d}-${m}-${y}`;
      }
      
      return {
        nama: String(raw[0] || "-"),
        hari: String(raw[1] || "-"),
        tanggal: String(formattedDate || "-"),
        waktuKeluar: String(disp[3] || "-"), // Menggunakan teks display murni
        waktuKembali: String(disp[4] || "-"), // Menggunakan teks display murni
        keterangan: String(raw[5] || "-")
      };
    });
  } catch (error) { 
    return []; 
  }
}

// Wrapper API untuk dipanggil dari client side (index.html)

function getRecords(data) {
  let employeeName = "";
  if (data && typeof data === 'object') {
    employeeName = data.nama;
  } else if (typeof data === 'string') {
    employeeName = data;
  }
  try {
    const records = getRecordsInternal(employeeName);
    return { success: true, data: records };
  } catch (e) {
    return { success: false, message: e.toString(), data: [] };
  }
}

function updateTime(data) {
  try {
    const sessionId = data.sessionId;
    const employeeName = data.nama;
    const type = data.type;
    const waktu = data.time;
    return updateTimeSafe(sessionId, employeeName, type, waktu);
  } catch (error) {
    return { success: false, message: "Gagal memperbarui waktu: " + error.toString() };
  }
}

function deleteRecord(data) {
  try {
    const sessionId = data.sessionId;
    const employeeName = data.nama;
    return deleteRecordSafe(sessionId, employeeName);
  } catch (error) {
    return { success: false, message: "Gagal menghapus data: " + error.toString() };
  }
}

function checkSession(data) {
  try {
    const sessionId = data.sessionId;
    const employeeName = data.nama;
    return checkSessionActive(sessionId, employeeName);
  } catch (error) {
    return { found: false, error: error.toString() };
  }
}

// Handler request HTTP POST (CORS-compliant) untuk pengujian lokal/eksternal
function doPost(e) {
  let requestData;
  try {
    if (e && e.postData && e.postData.contents) {
      const contents = e.postData.contents;
      try {
        requestData = JSON.parse(contents);
      } catch (err) {
        if (e.parameter && e.parameter.data) {
          requestData = JSON.parse(e.parameter.data);
        } else {
          requestData = e.parameter;
        }
      }
    } else if (e && e.parameter && e.parameter.data) {
      requestData = JSON.parse(e.parameter.data);
    } else if (e && e.parameter) {
      requestData = e.parameter;
    } else {
      requestData = {};
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Gagal memproses request payload: " + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const action = requestData.action;
  let result;

  try {
    switch (action) {
      case 'getEmployeeNames':
        result = getEmployeeNames();
        break;
      case 'saveRecord':
        result = saveRecord(requestData);
        break;
      case 'updateTime':
        result = updateTime(requestData);
        break;
      case 'deleteRecord':
        result = deleteRecord(requestData);
        break;
      case 'checkSession':
        result = checkSession(requestData);
        break;
      case 'getRecords':
        result = getRecords(requestData);
        break;
      case 'getAllRecords':
        result = getAllRecords();
        break;
      case 'getSpreadsheetUrl':
        result = { success: true, url: getSpreadsheetUrl() };
        break;
      case 'getScriptUrl':
        result = { success: true, url: getScriptUrl() };
        break;
      case 'adminForceCompleteSession':
        result = adminForceCompleteSession(requestData.sessionId, requestData.nama, requestData.time);
        break;
      case 'adminDeleteRecord':
        result = adminDeleteRecord(requestData.sessionId, requestData.nama);
        break;
      default:
        result = { success: false, message: "Aksi tidak dikenal: " + action };
    }
  } catch (err) {
    result = { success: false, message: "Terjadi kesalahan di server: " + err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// Mengambil semua riwayat dari database untuk Dashboard Monitoring
function getAllRecords() {
  try {
    const sheet = getSheet();
    const range = sheet.getDataRange();
    const rows = range.getValues();
    const displayRows = range.getDisplayValues();
    
    if (rows.length <= 1) return { success: true, data: [] };
    
    const records = [];
    for (let i = 1; i < rows.length; i++) {
      const raw = rows[i];
      const disp = displayRows[i];
      
      let rawDate = raw[2];
      let formattedDate = rawDate;
      if (rawDate instanceof Date) {
        const d = rawDate.getDate().toString().padStart(2, '0');
        const m = (rawDate.getMonth() + 1).toString().padStart(2, '0');
        const y = rawDate.getFullYear();
        formattedDate = `${d}-${m}-${y}`; // Format DD-MM-YYYY
      } else if (typeof rawDate === 'string' && rawDate.includes('-')) {
        const cleanDate = rawDate.split('T')[0];
        const parts = cleanDate.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) { // YYYY-MM-DD
            formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          } else {
            formattedDate = cleanDate;
          }
        }
      }
      
      const waktuKeluar = String(disp[3] || "-").trim();
      const waktuKembali = String(disp[4] || "-").trim();
      
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
      
      records.push({
        nama: String(raw[0] || "-"),
        hari: String(raw[1] || "-"),
        tanggal: String(formattedDate || "-"),
        waktuKeluar: waktuKeluar,
        waktuKembali: waktuKembali,
        keterangan: String(raw[5] || "-"),
        timestamp: raw[6] ? new Date(raw[6]).toISOString() : "",
        sessionId: raw.length > 7 ? String(raw[7] || "") : "",
        durasiMenit: durasiMenit,
        durasiTeks: durasiTeks
      });
    }
    
    // Urutkan berdasarkan timestamp descending
    records.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });
    
    return { success: true, data: records };
  } catch (error) {
    Logger.log("Error getAllRecords: " + error.toString());
    return { success: false, message: error.toString(), data: [] };
  }
}

// Helper hitung durasi dalam menit
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
  } catch(e) {}
  return null;
}

// Helper format durasi ke teks jam/menit
function formatDurasi(menit) {
  if (menit === null || menit < 0) return "-";
  const jam = Math.floor(menit / 60);
  const sisaMenit = menit % 60;
  if (jam > 0) {
    return `${jam} jam ${sisaMenit} menit`;
  }
  return `${sisaMenit} menit`;
}

// Mengambil URL spreadsheet aktif secara dinamis
function getSpreadsheetUrl() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet().getUrl();
  } catch (e) {
    const properties = PropertiesService.getScriptProperties();
    let sheetId = properties.getProperty("SPREADSHEET_ID");
    if (sheetId) {
      return "https://docs.google.com/spreadsheets/d/" + sheetId + "/edit";
    }
  }
  return "#";
}

// Mengambil URL script web app secara dinamis
function getScriptUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return "";
  }
}

// Admin menyelesaikan sesi secara paksa
function adminForceCompleteSession(sessionId, employeeName, kembaliTime) {
  try {
    const sheet = getSheet();
    const rowIndex = findRowBySessionOrEmployee(sessionId, employeeName);
    
    if (!rowIndex) {
      return { success: false, message: "Sesi aktif tidak ditemukan di database." };
    }
    
    sheet.getRange(rowIndex, 5).setValue("'" + kembaliTime); // Waktu Kembali (Kolom E)
    return { success: true, message: `Sesi ${employeeName} berhasil diselesaikan pada pukul ${kembaliTime}.` };
  } catch (error) {
    return { success: false, message: "Gagal menyelesaikan sesi: " + error.toString() };
  }
}

// Admin menghapus log secara paksa
function adminDeleteRecord(sessionId, employeeName) {
  try {
    return deleteRecordSafe(sessionId, employeeName);
  } catch (error) {
    return { success: false, message: "Gagal menghapus log: " + error.toString() };
  }
}