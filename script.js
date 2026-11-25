// ฟังก์ชันช่วยแปลงรูปแบบวันที่ YYYY-MM-DD -> DD/MM/YYYY
function formatDate(dateStr) {
    if (!dateStr) return "-";
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr; 
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
}

// ฟังก์ชันช่วยแปลงรูปแบบเดือน YYYY-MM -> MM-YYYY
function formatMonth(monthStr) {
    if (!monthStr) return "-";
    const parts = monthStr.split('-');
    if (parts.length < 2) return monthStr;
    const [y, m] = parts;
    return `${m}-${y}`;
}

function calculate() {
    const rentVal  = +rent.value || 0;
    const waterVal = +water.value || 0;
    const otherVal = +other.value || 0;

    const beforeVal = +eBefore.value || 0;
    const afterVal  = +eAfter.value || 0;
    const rateVal   = +eRate.value || 0;

    const unitUsed = Math.max(afterVal - beforeVal, 0);
    const electricVal = unitUsed * rateVal;

    const total = rentVal + waterVal + electricVal + otherVal;

    // ส่วนการแสดงผลบนใบแจ้งหนี้
    iRoom.innerText = room.value || "-";
    
    // แก้ไข: แสดงเดือนแบบ M-Y (เช่น 01-2569)
    iDate.innerText = formatMonth(month.value);

    iRent.innerText  = rentVal.toLocaleString();
    iWater.innerText = waterVal.toLocaleString();
    iOther.innerText = otherVal.toLocaleString();

    /* รายละเอียดค่าไฟ */
    // แก้ไข: แสดงวันที่แบบ D/M/Y (เช่น 01/12/2568)
    iElectricDetail.innerHTML =
        `<br> ${formatDate(dateBefore.value)}<br>` +
        ` ${formatDate(dateAfter.value)}<br>` +
        ``;

    /* ช่องหน่วย (ตรงบรรทัดของมัน) */
    iUnit.innerHTML =
        `<br> ${beforeVal}<br>` +
        ` ${afterVal}<br>` +
        `${unitUsed}`;

    /* ช่องเงิน: เว้น 2 บรรทัด */
    iElectric.innerHTML = `<br><br>${electricVal.toLocaleString()}`;

    iTotal.innerText = total.toLocaleString();
}

function downloadImage() {
    const element = document.getElementById('invoice');
    
    html2canvas(element, {
        scale: 2, 
        useCORS: true, 
        logging: true
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'bill-' + (room.value || 'no-room') + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
}


/* =====================================================
   ดึงข้อมูลจาก Google Sheet
   ===================================================== */
let sheetRows = [];   // ห้องที่อ่านได้จากชีต

// แปลง CSV เป็น array 2 มิติ (รองรับ "..." และ , ในช่อง)
function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', inQuote = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuote) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') inQuote = false;
            else cell += ch;
        } else if (ch === '"') inQuote = true;
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

// "1,234" -> 1234 ; ข้อความหรือว่าง -> null
function toNum(v) {
    if (v === undefined || v === null) return null;
    const s = String(v).replace(/[,\s฿]/g, '');
    if (s === '' || isNaN(s)) return null;
    return Number(s);
}

// แปลงตารางจากชีตเป็นรายการห้อง
function rowsToRooms(table) {
    const head = table[0].map(h => h.trim());
    const col = name => head.findIndex(h => h.replace(/\s/g, '').toLowerCase() === name);
    const idx = {
        room:   col('ห้อง'),
        rent:   col('ค่าห้อง'),
        water:  col('ค่าน้ำ'),
        before: col('หน่วยไฟเดิม'),
        after:  col('หน่วยไฟใหม่'),
        wifi:   col('wi-fi'),
        note:   col('หมายเหตุ')
    };
    const missing = Object.entries(idx)
        .filter(([k, v]) => v < 0 && k !== 'note').map(([k]) => k);
    if (missing.length) throw new Error('ไม่พบหัวคอลัมน์: ' + missing.join(', '));

    const rooms = [];
    for (const r of table.slice(1)) {
        const name = (r[idx.room] || '').trim();
        if (!name || name === 'รวม') continue;

        const before = toNum(r[idx.before]);
        const after  = toNum(r[idx.after]);
        if (before === null && after === null) continue;   // ห้องที่ไม่มีมิเตอร์ ข้าม

        const rentRaw = (r[idx.rent] || '').trim();
        rooms.push({
            room:   name,
            rent:   toNum(rentRaw) ?? 0,
            water:  toNum(r[idx.water]) ?? 0,
            wifi:   toNum(r[idx.wifi]) ?? 0,
            before: before ?? 0,
            after:  after ?? 0,
            note:   toNum(rentRaw) === null && rentRaw ? rentRaw : ''   // เช่น "ห้องพระ"
        });
    }
    return rooms;
}

async function loadSheet() {
    const status = document.getElementById('sheetStatus');
    const url = sheetUrl.value.trim();
    const id = (url.match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1];
    const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1];
    if (!id) { status.textContent = 'ลิงก์ไม่ถูกต้อง'; status.className = 'sheet-status err'; return; }

    const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv` +
                   (gid ? `&gid=${gid}` : '');

    loadBtn.disabled = true;
    status.className = 'sheet-status';
    status.textContent = 'กำลังดึงข้อมูล...';
    try {
        const res = await fetch(csvUrl);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        if (text.trim().startsWith('<')) throw new Error('ชีตไม่ได้เปิดแชร์แบบ "ทุกคนที่มีลิงก์"');

        sheetRows = rowsToRooms(parseCSV(text));
        if (!sheetRows.length) throw new Error('ไม่พบข้อมูลห้อง');

        roomSelect.innerHTML = '<option value="">-- เลือกห้อง --</option>' +
            sheetRows.map((r, i) =>
                `<option value="${i}">${r.room}${r.note ? ' (' + r.note + ')' : ''}</option>`).join('');
        roomSelect.disabled = false;

        status.textContent = `ดึงสำเร็จ ${sheetRows.length} ห้อง`;
        status.className = 'sheet-status ok';
    } catch (e) {
        status.textContent = 'ดึงข้อมูลไม่สำเร็จ: ' + e.message;
        status.className = 'sheet-status err';
    } finally {
        loadBtn.disabled = false;
    }
}

// เลือกห้อง -> กรอกฟอร์ม -> คำนวณบิลให้เลย
function pickRoom(i) {
    if (i === '') return;
    const r = sheetRows[+i];
    room.value   = r.room;
    rent.value   = r.rent;
    water.value  = r.water;
    other.value  = r.wifi;
    eBefore.value = r.before;
    eAfter.value  = r.after;
    calculate();
}

// ปุ่มห้องก่อนหน้า/ถัดไป
function stepRoom(d) {
    if (!sheetRows.length) return;
    let i = roomSelect.value === '' ? (d > 0 ? 0 : sheetRows.length - 1) : +roomSelect.value + d;
    i = Math.min(Math.max(i, 0), sheetRows.length - 1);
    roomSelect.value = i;
    pickRoom(String(i));
}
