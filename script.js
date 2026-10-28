/**
 * ============================================================================
 * SISTEM ABSENSI TIDUR MALAM ASRAMA AL-FAJR
 * script.js - Logika RFID USB HID, LocalStorage, Modul Admin & Ekspor CSV
 * ============================================================================
 */

// 1. DATA MASTER SANTRI (Default Seed)
// Sesuai instruksi: Menggunakan gambar yang sudah ada (Rafli.jpg & Yusuf.jpg)
const DEFAULT_SANTRI_LIST = [
    {
        uid: "0008530324",
        nama: "Rafli Adzharur",
        kamar: "Kamar 401",
        foto: "Rafli.jpg"
    },
    {
        uid: "0008453315",
        nama: "Yusuf Hafidhudin",
        kamar: "Kamar 402",
        foto: "Yusuf.jpg"
    },
    {
        uid: "0009123841",
        nama: "Ahmad Fauzi Rahman",
        kamar: "Kamar 401",
        foto: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80"
    },
    {
        uid: "0009234852",
        nama: "Muhammad Rizky Pratama",
        kamar: "Kamar 402",
        foto: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&auto=format&fit=crop&q=80"
    },
    {
        uid: "0009345863",
        nama: "Fajar Ilham Ramadhan",
        kamar: "Kamar 403",
        foto: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80"
    },
    {
        uid: "0009456874",
        nama: "Farhan Maulana Malik",
        kamar: "Kamar 403",
        foto: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80"
    },
    {
        uid: "0009567885",
        nama: "Zaidan Hakim Ar-Rasyid",
        kamar: "Kamar 404",
        foto: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80"
    },
    {
        uid: "0009678896",
        nama: "Bilal Syahrul Mubarok",
        kamar: "Kamar 404",
        foto: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=400&auto=format&fit=crop&q=80"
    }
];

// Konfigurasi Kunci LocalStorage
const STORAGE_KEYS = {
    MASTER_SANTRI: "alfajr_master_santri_v1",
    ATTENDANCE_PREFIX: "alfajr_attendance_"
};

// Password Default Admin
const ADMIN_CONFIG = {
    PASSWORD: "admin123"
};

// State Aplikasi
let isSoundEnabled = true;
let isPasswordVisible = false;
let audioCtx = null;
let lastScannedUid = null;
let lastScanTime = 0;
let pendingDeleteId = null; // Menyimpan ID data absen yang akan dihapus
let isResetAllMode = false; // Flag jika yang dihapus adalah seluruh data hari ini
let currentDisplayedUid = null; // UID santri yang sedang tampil di hero display

// Referensi Elemen DOM Layar Utama
const rfidInput = document.getElementById("rfidInput");
const appTitle = document.getElementById("appTitle");
const idleDisplayCard = document.getElementById("idleDisplayCard");
const activeSantriCard = document.getElementById("activeSantriCard");
const unknownCardAlert = document.getElementById("unknownCardAlert");
const activeSantriPhoto = document.getElementById("activeSantriPhoto");
const activeSantriName = document.getElementById("activeSantriName");
const activeSantriKamar = document.getElementById("activeKamarText");
const activeSantriUID = document.getElementById("activeSantriUID");
const activeScanTimestamp = document.getElementById("activeScanTimestamp");
const activeStatusBadge = document.getElementById("activeStatusBadge");
const activeStatusBadgeText = document.getElementById("activeStatusBadgeText");
const activeStatusMalamText = document.getElementById("activeStatusMalamText");
const repeatScanNotice = document.getElementById("repeatScanNotice");
const repeatOriginalTime = document.getElementById("repeatOriginalTime");
const unknownUIDText = document.getElementById("unknownUIDText");
const logTableBody = document.getElementById("logTableBody");
const totalScansCount = document.getElementById("totalScansCount");
const soundToggleBtn = document.getElementById("soundToggleBtn");
const soundIconOn = document.getElementById("soundIconOn");
const soundIconOff = document.getElementById("soundIconOff");

// Referensi Elemen Modal Login Admin
const adminPasswordModal = document.getElementById("adminPasswordModal");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const passwordErrorMsg = document.getElementById("passwordErrorMsg");

// Referensi Elemen Modal Dashboard Admin
const adminDashboardModal = document.getElementById("adminDashboardModal");

// Referensi Elemen Modal Hapus Absen dengan Password
const deleteConfirmModal = document.getElementById("deleteConfirmModal");
const deleteTargetInfo = document.getElementById("deleteTargetInfo");
const deleteAdminPasswordInput = document.getElementById("deleteAdminPasswordInput");
const deletePasswordErrorMsg = document.getElementById("deletePasswordErrorMsg");

/* ==========================================================================
   2. INITIALIZATION & LOCALSTORAGE MANAGEMENT
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    initDatabase();
    initClock();
    initRFIDReader();
    initAdminSecretTrigger();
    renderTodayHistoryTable();
});

/**
 * Inisialisasi Master Data Santri ke LocalStorage jika belum ada
 */
function initDatabase() {
    const existingMaster = localStorage.getItem(STORAGE_KEYS.MASTER_SANTRI);
    if (!existingMaster) {
        localStorage.setItem(STORAGE_KEYS.MASTER_SANTRI, JSON.stringify(DEFAULT_SANTRI_LIST));
    }
}

/**
 * Mengambil daftar santri dari database lokal
 */
function getMasterSantriList() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.MASTER_SANTRI);
        return raw ? JSON.parse(raw) : DEFAULT_SANTRI_LIST;
    } catch (e) {
        console.error("Gagal membaca master santri:", e);
        return DEFAULT_SANTRI_LIST;
    }
}

/**
 * Format tanggal lokal untuk key database harian (YYYY-MM-DD)
 */
function getTodayDateKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Mengambil seluruh data scan malam ini dari LocalStorage
 */
function getTodayAttendanceLogs() {
    try {
        const key = STORAGE_KEYS.ATTENDANCE_PREFIX + getTodayDateKey();
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error("Gagal membaca riwayat absensi:", e);
        return [];
    }
}

/**
 * Menyimpan data record absen baru ke LocalStorage
 */
function saveAttendanceRecord(record) {
    const key = STORAGE_KEYS.ATTENDANCE_PREFIX + getTodayDateKey();
    const logs = getTodayAttendanceLogs();
    logs.unshift(record); // Tambahkan ke urutan paling atas
    localStorage.setItem(key, JSON.stringify(logs));
}

/**
 * Menyimpan array logs yang sudah diubah ke LocalStorage
 */
function saveTodayAttendanceLogs(logs) {
    const key = STORAGE_KEYS.ATTENDANCE_PREFIX + getTodayDateKey();
    localStorage.setItem(key, JSON.stringify(logs));
}

/* ==========================================================================
   3. RFID USB HID SCANNER LOGIC & INPUT FOCUS
   ========================================================================== */

/**
 * Pengaturan autofocus agar pembacaan kartu RFID (USB Reader) selalu tertangkap
 */
function initRFIDReader() {
    focusRFIDInput();

    // Event input RFID ketika scanner mengirim tombol 'Enter'
    rfidInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const uid = rfidInput.value.trim();
            if (uid !== "") {
                prosesScanKartu(uid);
            }
            rfidInput.value = "";
        }
    });

    // Menjaga fokus ke rfidInput jika user klik di layar,
    // KECUALI jika ada modal dialog yang sedang terbuka
    document.addEventListener("click", (e) => {
        const isAnyModalOpen = 
            (adminPasswordModal && adminPasswordModal.style.display !== "none") ||
            (adminDashboardModal && adminDashboardModal.style.display !== "none") ||
            (deleteConfirmModal && deleteConfirmModal.style.display !== "none");
        
        const isInteractive = e.target.closest("input, button, select, a, textarea");
        
        if (!isAnyModalOpen && !isInteractive) {
            focusRFIDInput();
        }
    });
}

function focusRFIDInput() {
    const isAnyModalOpen = 
        (adminPasswordModal && adminPasswordModal.style.display !== "none") ||
        (adminDashboardModal && adminDashboardModal.style.display !== "none") ||
        (deleteConfirmModal && deleteConfirmModal.style.display !== "none");

    if (rfidInput && !isAnyModalOpen) {
        rfidInput.focus();
    }
}

/**
 * Memproses UID yang terdeteksi dari kartu RFID
 * Aturan Penting:
 * 1. Jika sudah absen pada malam yang sama, data TIDAK digandakan (masuk hanya satu).
 * 2. Layar tetap update menampilkan foto & nama santri dengan status "SUDAH ABSEN SEBELUMNYA".
 */
function prosesScanKartu(uid) {
    const masterSantri = getMasterSantriList();
    const santri = masterSantri.find(s => s.uid.toLowerCase() === uid.toLowerCase());
    const now = new Date();
    const waktuStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " WIB";
    const tanggalStr = now.toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // Cooldown tap ganda instan (2 detik)
    const currentTime = Date.now();
    if (lastScannedUid === uid && (currentTime - lastScanTime) < 2000) {
        return;
    }
    lastScannedUid = uid;
    lastScanTime = currentTime;

    if (santri) {
        const todayLogs = getTodayAttendanceLogs();
        // Cek apakah santri ini sudah pernah absen pada malam hari ini
        const existingRecord = todayLogs.find(l => l.uid.toLowerCase() === santri.uid.toLowerCase());

        if (existingRecord) {
            // ========================================================
            // KASUS 1: SANTRI SUDAH ABSEN MALAM INI (CEGAH DATA DOUBLE)
            // ========================================================
            playScanSound(true);

            // Update spotlight card dengan penanda sudah absen sebelumnya
            showActiveSantriDisplay({
                uid: santri.uid,
                nama: santri.nama,
                kamar: santri.kamar,
                foto: santri.foto,
                waktu: waktuStr, // Waktu tap saat ini
                isDuplicate: true,
                originalWaktu: existingRecord.waktu
            });

            // PERHATIKAN: Data TIDAK ditambahkan ke database & TIDAK ditambahkan ke tabel
            // Data di database tetap cuman 1 record dari absensi pertama!
        } else {
            // ========================================================
            // KASUS 2: SANTRI PERTAMA KALI ABSEN MALAM INI
            // ========================================================
            playScanSound(true);

            const attendanceRecord = {
                id: Date.now(),
                uid: santri.uid,
                nama: santri.nama,
                kamar: santri.kamar,
                foto: santri.foto,
                waktu: waktuStr,
                tanggal: tanggalStr,
                timestamp: currentTime
            };

            // Simpan ke database lokal (localStorage)
            saveAttendanceRecord(attendanceRecord);

            // Update tampilan spotlight kartu santri di layar utama
            showActiveSantriDisplay({
                ...attendanceRecord,
                isDuplicate: false
            });

            // Update tabel riwayat scan terkini
            renderTodayHistoryTable();
        }
    } else {
        // ========================================================
        // KASUS 3: KARTU TIDAK TERDAFTAR
        // ========================================================
        playScanSound(false);
        showUnknownCardDisplay(uid);
    }
}

/**
 * Menampilkan kartu santri di layar utama
 */
function showActiveSantriDisplay(record) {
    currentDisplayedUid = record.uid;

    // Sembunyikan idle card dan alert unknown
    idleDisplayCard.style.display = "none";
    unknownCardAlert.style.display = "none";

    // Set foto dan data santri
    activeSantriPhoto.src = record.foto;
    activeSantriPhoto.alt = record.nama;
    activeSantriName.textContent = record.nama;
    activeSantriKamar.textContent = record.kamar;
    activeSantriUID.textContent = record.uid;
    activeScanTimestamp.textContent = record.waktu;

    if (record.isDuplicate) {
        // Santri sudah absen sebelumnya -> status info warna cyan
        activeStatusBadge.className = "badge-info-glow";
        activeStatusBadgeText.textContent = "SUDAH ABSEN SEBELUMNYA";
        activeStatusMalamText.textContent = "Sudah Hadir (Data Tidak Digandakan)";
        activeStatusMalamText.className = "meta-val text-cyan";

        if (repeatScanNotice && repeatOriginalTime) {
            repeatOriginalTime.textContent = record.originalWaktu;
            repeatScanNotice.style.display = "flex";
        }
    } else {
        // Santri baru absen berhasil -> status sukses warna hijau emerald
        activeStatusBadge.className = "badge-success-glow";
        activeStatusBadgeText.textContent = "ABSENSI BERHASIL";
        activeStatusMalamText.textContent = "Hadir di Asrama";
        activeStatusMalamText.className = "meta-val text-emerald";

        if (repeatScanNotice) {
            repeatScanNotice.style.display = "none";
        }
    }

    // Reset animasi tampilan
    activeSantriCard.style.display = "flex";
    activeSantriCard.classList.remove("active-card");
    void activeSantriCard.offsetWidth; // trigger reflow
    activeSantriCard.classList.add("active-card");
}

/**
 * Menampilkan peringatan saat kartu RFID belum terdaftar
 */
function showUnknownCardDisplay(uid) {
    currentDisplayedUid = null;
    idleDisplayCard.style.display = "none";
    activeSantriCard.style.display = "none";

    unknownUIDText.textContent = uid;
    unknownCardAlert.style.display = "flex";

    // Kembalikan ke idle card otomatis setelah 6 detik jika tidak ada scan baru
    setTimeout(() => {
        if (unknownCardAlert.style.display !== "none") {
            unknownCardAlert.style.display = "none";
            idleDisplayCard.style.display = "flex";
        }
    }, 6000);
}

/**
 * Kembalikan spotlight card ke idle state
 */
function resetHeroCardToIdle() {
    currentDisplayedUid = null;
    activeSantriCard.style.display = "none";
    unknownCardAlert.style.display = "none";
    idleDisplayCard.style.display = "flex";
}

/**
 * Render tabel riwayat absen malam ini pada layar utama
 */
function renderTodayHistoryTable() {
    const logs = getTodayAttendanceLogs();
    totalScansCount.textContent = logs.length;

    if (logs.length === 0) {
        logTableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                            <line x1="6" y1="8" x2="18" y2="8"></line>
                            <line x1="6" y1="12" x2="14" y2="12"></line>
                            <line x1="6" y1="16" x2="10" y2="16"></line>
                        </svg>
                        <p>Belum ada santri yang absen malam ini.</p>
                        <span>Silakan tempelkan kartu RFID pada scanner.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    logTableBody.innerHTML = logs.map((item, index) => `
        <tr>
            <td style="color: var(--text-muted); font-weight: 600;">${logs.length - index}</td>
            <td>
                <div class="table-user-cell">
                    <img src="${item.foto}" class="table-avatar" alt="${item.nama}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(item.nama)}&background=0D9488&color=fff'">
                    <div class="table-user-info">
                        <span class="table-user-name">${item.nama}</span>
                        <span class="table-user-uid font-mono">UID: ${item.uid}</span>
                    </div>
                </div>
            </td>
            <td>
                <span class="room-tag" style="margin: 0; padding: 0.2rem 0.55rem; font-size: 0.775rem;">
                    ${item.kamar}
                </span>
            </td>
            <td style="font-weight: 600; color: #a5f3fc; font-variant-numeric: tabular-nums;">
                ${item.waktu}
            </td>
            <td>
                <span class="badge-status-chip chip-success">Hadir</span>
            </td>
            <td style="text-align: center;">
                <button type="button" class="btn-delete-row" title="Hapus Data Absen (Perlu Password Admin)" onclick="promptDeleteAttendance(${item.id})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </td>
        </tr>
    `).join("");
}

/* ==========================================================================
   4. MODUL ADMIN TERSEMBUNYI (DOUBLE-CLICK TITLE, TANPA PETUNJUK UI)
   ========================================================================== */

/**
 * Trigger Rahasia: Double-Click pada Judul Halaman
 * Tidak ada petunjuk visual, tooltip, atau pointer cursor agar benar-benar tersembunyi
 */
function initAdminSecretTrigger() {
    if (appTitle) {
        appTitle.addEventListener("dblclick", (e) => {
            e.preventDefault();
            openAdminPasswordModal();
        });
    }

    // Toggle suara beep scanner
    if (soundToggleBtn) {
        soundToggleBtn.addEventListener("click", toggleSound);
    }
}

/**
 * Membuka Modal Verifikasi Password Admin
 */
function openAdminPasswordModal() {
    adminPasswordModal.style.display = "flex";
    adminPasswordInput.value = "";
    passwordErrorMsg.style.display = "none";
    setTimeout(() => {
        adminPasswordInput.focus();
    }, 100);
}

/**
 * Menutup Modal Verifikasi Password Admin
 */
window.closeAdminPasswordModal = function() {
    adminPasswordModal.style.display = "none";
    adminPasswordInput.value = "";
    passwordErrorMsg.style.display = "none";
    focusRFIDInput();
};

/**
 * Toggle lihat / sembunyikan kata sandi admin
 */
window.togglePasswordVisibility = function() {
    isPasswordVisible = !isPasswordVisible;
    adminPasswordInput.type = isPasswordVisible ? "text" : "password";
};

/**
 * Memverifikasi Kata Sandi Admin (Default: admin123)
 */
window.handleAdminLogin = function(event) {
    event.preventDefault();
    const inputPassword = adminPasswordInput.value.trim();

    if (inputPassword === ADMIN_CONFIG.PASSWORD) {
        closeAdminPasswordModal();
        openAdminDashboardModal();
    } else {
        passwordErrorMsg.style.display = "flex";
        adminPasswordInput.select();
        
        const modalBox = adminPasswordModal.querySelector(".modal-container");
        modalBox.animate([
            { transform: "translateX(0)" },
            { transform: "translateX(-10px)" },
            { transform: "translateX(10px)" },
            { transform: "translateX(-8px)" },
            { transform: "translateX(8px)" },
            { transform: "translateX(0)" }
        ], { duration: 350 });
    }
};

/* ==========================================================================
   5. FITUR HAPUS DATA ABSEN DENGAN VERIFIKASI PASSWORD ADMIN
   ========================================================================== */

/**
 * Membuka Modal Konfirmasi Penghapusan Data Absensi Tertentu
 */
window.promptDeleteAttendance = function(recordId) {
    const logs = getTodayAttendanceLogs();
    const targetRecord = logs.find(item => item.id === recordId);

    if (!targetRecord) {
        alert("Data absensi tidak ditemukan.");
        return;
    }

    pendingDeleteId = recordId;
    isResetAllMode = false;

    // Isi ringkasan target santri yang akan dihapus
    deleteTargetInfo.innerHTML = `
        <img src="${targetRecord.foto}" class="delete-target-avatar" alt="${targetRecord.nama}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(targetRecord.nama)}&background=1E293B&color=fff'">
        <div>
            <div class="delete-target-name">${targetRecord.nama}</div>
            <div class="delete-target-sub">
                <span>🏢 ${targetRecord.kamar}</span>
                <span>•</span>
                <span>🕒 Absen: ${targetRecord.waktu}</span>
            </div>
        </div>
    `;

    // Reset form password
    deleteAdminPasswordInput.value = "";
    deletePasswordErrorMsg.style.display = "none";
    deleteConfirmModal.style.display = "flex";

    setTimeout(() => {
        deleteAdminPasswordInput.focus();
    }, 100);
};

/**
 * Menutup Modal Hapus Data Absen
 */
window.closeDeleteModal = function() {
    deleteConfirmModal.style.display = "none";
    deleteAdminPasswordInput.value = "";
    deletePasswordErrorMsg.style.display = "none";
    pendingDeleteId = null;
    isResetAllMode = false;
    focusRFIDInput();
};

/**
 * Handler Submit Password untuk Hapus Data
 */
window.handleDeleteWithPassword = function(event) {
    event.preventDefault();
    const inputPassword = deleteAdminPasswordInput.value.trim();

    if (inputPassword !== ADMIN_CONFIG.PASSWORD) {
        // Password Admin Salah!
        deletePasswordErrorMsg.style.display = "flex";
        deleteAdminPasswordInput.select();

        const modalBox = deleteConfirmModal.querySelector(".modal-container");
        modalBox.animate([
            { transform: "translateX(0)" },
            { transform: "translateX(-10px)" },
            { transform: "translateX(10px)" },
            { transform: "translateX(-8px)" },
            { transform: "translateX(8px)" },
            { transform: "translateX(0)" }
        ], { duration: 350 });
        return;
    }

    // Password Benar! Lakukan Penghapusan
    if (isResetAllMode) {
        // Mode Reset Seluruh Data Hari Ini
        const key = STORAGE_KEYS.ATTENDANCE_PREFIX + getTodayDateKey();
        localStorage.removeItem(key);
        resetHeroCardToIdle();
        alert("Seluruh data absensi malam ini berhasil di-reset.");
    } else if (pendingDeleteId) {
        // Mode Hapus 1 Santri
        const logs = getTodayAttendanceLogs();
        const targetRecord = logs.find(item => item.id === pendingDeleteId);
        const filteredLogs = logs.filter(item => item.id !== pendingDeleteId);
        
        saveTodayAttendanceLogs(filteredLogs);

        // Jika santri yang dihapus saat ini sedang tampil di spotlight card, kembalikan ke idle
        if (targetRecord && currentDisplayedUid === targetRecord.uid) {
            resetHeroCardToIdle();
        }

        alert(`Data absensi santri "${targetRecord ? targetRecord.nama : 'Santri'}" berhasil dihapus.`);
    }

    // Tutup Modal Hapus
    closeDeleteModal();

    // Render ulang seluruh tampilan terkait
    renderTodayHistoryTable();
    if (adminDashboardModal.style.display !== "none") {
        updateAdminDashboardData();
    }
};

/**
 * Konfirmasi Reset Seluruh Absen Hari Ini (dengan Proteksi Password Admin)
 */
window.confirmResetHariIni = function() {
    pendingDeleteId = null;
    isResetAllMode = true;

    deleteTargetInfo.innerHTML = `
        <div style="color: #f87171; font-weight: 700; font-size: 0.95rem;">
            ⚠️ Reset Seluruh Data Absensi Malam Ini
        </div>
        <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.25rem;">
            Semua santri yang sudah absen hari ini akan dikembalikan ke status 'Belum Absen'.
        </div>
    `;

    deleteAdminPasswordInput.value = "";
    deletePasswordErrorMsg.style.display = "none";
    deleteConfirmModal.style.display = "flex";

    setTimeout(() => {
        deleteAdminPasswordInput.focus();
    }, 100);
};

/* ==========================================================================
   6. DASHBOARD ADMIN: REKAP KAMAR & DAFTAR BELUM ABSEN
   ========================================================================== */

/**
 * Membuka Dashboard Admin & Mengkalkulasi Data Kehadiran
 */
function openAdminDashboardModal() {
    adminDashboardModal.style.display = "flex";
    updateAdminDashboardData();
}

/**
 * Menutup Dashboard Admin
 */
window.closeAdminDashboardModal = function() {
    adminDashboardModal.style.display = "none";
    focusRFIDInput();
};

/**
 * Mengkalkulasi KPI dan render santri belum absen per kamar
 */
function updateAdminDashboardData() {
    const masterSantri = getMasterSantriList();
    const todayLogs = getTodayAttendanceLogs();

    // Set of UIDs yang sudah absen hari ini
    const attendedUIDs = new Set(todayLogs.map(l => l.uid.toLowerCase()));

    // Pisahkan santri yang sudah absen dan belum absen
    const santriSudahAbsen = [];
    const santriBelumAbsen = [];

    masterSantri.forEach(santri => {
        const isAttended = attendedUIDs.has(santri.uid.toLowerCase());
        if (isAttended) {
            const logItem = todayLogs.find(l => l.uid.toLowerCase() === santri.uid.toLowerCase());
            santriSudahAbsen.push({
                ...santri,
                logId: logItem ? logItem.id : null,
                waktuAbsen: logItem ? logItem.waktu : "-"
            });
        } else {
            santriBelumAbsen.push(santri);
        }
    });

    // Update KPI Card
    const totalCount = masterSantri.length;
    const sudahCount = santriSudahAbsen.length;
    const belumCount = santriBelumAbsen.length;
    const percentage = totalCount > 0 ? Math.round((sudahCount / totalCount) * 100) : 0;

    document.getElementById("kpiTotalSantri").textContent = totalCount;
    document.getElementById("kpiSudahAbsen").textContent = sudahCount;
    document.getElementById("kpiBelumAbsen").textContent = belumCount;
    document.getElementById("kpiPersentase").textContent = `${percentage}%`;

    // Update Counter di Tab Button
    document.getElementById("tabCountBelum").textContent = belumCount;
    document.getElementById("tabCountSudah").textContent = sudahCount;
    document.getElementById("tabCountSemua").textContent = totalCount;

    // Render TAB 1: Kamar Grouping (Santri Belum Absen)
    renderRoomGroupedBelumAbsen(masterSantri, attendedUIDs);

    // Render TAB 2: Santri Sudah Absen
    renderSudahAbsenTable(santriSudahAbsen);

    // Render TAB 3: Master Data Santri
    renderSemuaSantriTable(masterSantri, attendedUIDs);
}

/**
 * Mengelompokkan dan menampilkan santri yang belum absen berdasarkan Kamar
 */
function renderRoomGroupedBelumAbsen(masterSantri, attendedUIDs) {
    const container = document.getElementById("roomGroupContainer");
    const roomsMap = {};

    masterSantri.forEach(santri => {
        const roomName = santri.kamar || "Lainnya";
        if (!roomsMap[roomName]) {
            roomsMap[roomName] = {
                total: 0,
                belumAbsen: []
            };
        }
        roomsMap[roomName].total++;

        if (!attendedUIDs.has(santri.uid.toLowerCase())) {
            roomsMap[roomName].belumAbsen.push(santri);
        }
    });

    const roomNames = Object.keys(roomsMap).sort();

    if (roomNames.length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1;">Belum ada data kamar.</p>`;
        return;
    }

    let cardsHtml = "";

    roomNames.forEach(roomName => {
        const roomData = roomsMap[roomName];
        const missingList = roomData.belumAbsen;
        const hasMissing = missingList.length > 0;

        cardsHtml += `
            <div class="room-card">
                <div class="room-card-header">
                    <div class="room-name-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 21h18M9 8h1m-1 4h1m-1 4h1m4-8h1m-1 4h1m-1 4h1M4 21V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v17"/>
                        </svg>
                        <span>${roomName}</span>
                    </div>
                    <span class="room-missing-badge ${hasMissing ? 'badge-has-missing' : 'badge-all-clear'}">
                        ${hasMissing ? `${missingList.length} Belum Absen` : '✅ Lengkap'}
                    </span>
                </div>
                <div class="room-santri-list">
                    ${hasMissing ? missingList.map(santri => `
                        <div class="room-santri-item">
                            <div class="santri-info-group">
                                <img src="${santri.foto}" class="santri-avatar-sm" alt="${santri.nama}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(santri.nama)}&background=1E293B&color=fff'">
                                <div>
                                    <div class="santri-mini-name">${santri.nama}</div>
                                    <div class="santri-mini-uid font-mono">UID: ${santri.uid}</div>
                                </div>
                            </div>
                            <span class="status-tag-missing">Belum Hadir</span>
                        </div>
                    `).join("") : `
                        <div style="padding: 1rem; text-align: center; color: #34d399; font-size: 0.85rem; font-weight: 600;">
                            ✨ Semua santri kamar ini sudah absen tidur malam.
                        </div>
                    `}
                </div>
            </div>
        `;
    });

    container.innerHTML = cardsHtml;
}

/**
 * Render Tabel Santri yang Sudah Absen di Admin
 */
function renderSudahAbsenTable(list) {
    const tbody = document.getElementById("sudahAbsenTableBody");
    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">
                    Belum ada santri yang tercatat absen malam ini.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = list.map((item, idx) => `
        <tr>
            <td style="color: var(--text-muted); font-weight: 600;">${idx + 1}</td>
            <td>
                <img src="${item.foto}" class="table-avatar" alt="${item.nama}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(item.nama)}&background=0D9488&color=fff'">
            </td>
            <td style="font-weight: 700; color: #ffffff;">${item.nama}</td>
            <td><span class="room-tag" style="margin: 0; padding: 0.2rem 0.55rem; font-size: 0.775rem;">${item.kamar}</span></td>
            <td class="font-mono" style="color: var(--text-secondary);">${item.uid}</td>
            <td style="color: #67e8f9; font-weight: 600;">${item.waktuAbsen}</td>
            <td><span class="badge-status-chip chip-success">Sudah Absen</span></td>
            <td style="text-align: center;">
                ${item.logId ? `
                    <button type="button" class="btn-delete-row" title="Hapus/Batalkan Absen Santri Ini" onclick="promptDeleteAttendance(${item.logId})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                ` : '-'}
            </td>
        </tr>
    `).join("");
}

/**
 * Render Tabel Master Semua Santri
 */
function renderSemuaSantriTable(masterSantri, attendedUIDs) {
    const tbody = document.getElementById("semuaSantriTableBody");
    tbody.innerHTML = masterSantri.map((santri, idx) => {
        const isAttended = attendedUIDs.has(santri.uid.toLowerCase());
        return `
            <tr>
                <td style="color: var(--text-muted); font-weight: 600;">${idx + 1}</td>
                <td>
                    <img src="${santri.foto}" class="table-avatar" alt="${santri.nama}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(santri.nama)}&background=1E293B&color=fff'">
                </td>
                <td style="font-weight: 700; color: #ffffff;">${santri.nama}</td>
                <td><span class="room-tag" style="margin: 0; padding: 0.2rem 0.55rem; font-size: 0.775rem;">${santri.kamar}</span></td>
                <td class="font-mono" style="color: var(--text-secondary);">${santri.uid}</td>
                <td>
                    ${isAttended 
                        ? `<span class="badge-status-chip chip-success">Sudah Absen</span>` 
                        : `<span class="badge-status-chip chip-danger">Belum Absen</span>`
                    }
                </td>
            </tr>
        `;
    }).join("");
}

/**
 * Pergantian Tab di dalam Dashboard Admin
 */
window.switchAdminTab = function(tabName) {
    const tabBtnBelum = document.getElementById("tabBtnBelumAbsen");
    const tabBtnSudah = document.getElementById("tabBtnSudahAbsen");
    const tabBtnSemua = document.getElementById("tabBtnSemuaSantri");

    const contentBelum = document.getElementById("tabContentBelumAbsen");
    const contentSudah = document.getElementById("tabContentSudahAbsen");
    const contentSemua = document.getElementById("tabContentSemuaSantri");

    [tabBtnBelum, tabBtnSudah, tabBtnSemua].forEach(btn => btn.classList.remove("active"));
    [contentBelum, contentSudah, contentSemua].forEach(c => c.style.display = "none");

    if (tabName === "belumAbsen") {
        tabBtnBelum.classList.add("active");
        contentBelum.style.display = "block";
    } else if (tabName === "sudahAbsen") {
        tabBtnSudah.classList.add("active");
        contentSudah.style.display = "block";
    } else if (tabName === "semua") {
        tabBtnSemua.classList.add("active");
        contentSemua.style.display = "block";
    }
};

/* ==========================================================================
   7. FITUR EKSPOR DATA KE FORMAT .CSV (EXCEL COMPATIBLE)
   ========================================================================== */

/**
 * Ekspor santri yang BELUM absen malam ini ke format CSV
 */
window.exportBelumAbsenCSV = function() {
    const masterSantri = getMasterSantriList();
    const todayLogs = getTodayAttendanceLogs();
    const attendedUIDs = new Set(todayLogs.map(l => l.uid.toLowerCase()));

    const belumAbsenList = masterSantri.filter(s => !attendedUIDs.has(s.uid.toLowerCase()));
    const dateStr = getTodayDateKey();
    const reportTitle = `LAPORAN SANTRI BELUM ABSEN TIDUR MALAM - ASRAMA AL-FAJR`;

    let csvContent = "";
    csvContent += `"${reportTitle}"\n`;
    csvContent += `"Tanggal Laporan: ${dateStr}"\n`;
    csvContent += `"Total Santri Belum Absen: ${belumAbsenList.length}"\n\n`;
    csvContent += `"No","UID Kartu","Nama Santri","Kamar","Status Kehadiran","Keterangan"\n`;

    if (belumAbsenList.length === 0) {
        csvContent += `"","","Nihil - Semua Santri Sudah Absen Malam Ini","","",""\n`;
    } else {
        belumAbsenList.forEach((item, index) => {
            const no = index + 1;
            const uid = `="${item.uid}"`;
            const nama = `"${item.nama.replace(/"/g, '""')}"`;
            const kamar = `"${item.kamar.replace(/"/g, '""')}"`;
            const status = `"BELUM ABSEN"`;
            const ket = `"Perlu diperiksa ke kamar"`;
            csvContent += `${no},${uid},${nama},${kamar},${status},${ket}\n`;
        });
    }

    downloadCSV(csvContent, `Laporan_Belum_Absen_Al-Fajr_${dateStr}.csv`);
};

/**
 * Ekspor SEMUA rekap kehadiran santri malam ini ke format CSV
 */
window.exportSemuaKehadiranCSV = function() {
    const masterSantri = getMasterSantriList();
    const todayLogs = getTodayAttendanceLogs();
    const dateStr = getTodayDateKey();

    let csvContent = "";
    csvContent += `"REKAP LENGKAP ABSENSI TIDUR MALAM - ASRAMA AL-FAJR"\n`;
    csvContent += `"Tanggal: ${dateStr}"\n\n`;
    csvContent += `"No","UID Kartu","Nama Santri","Kamar","Status","Waktu Absen"\n`;

    masterSantri.forEach((santri, index) => {
        const no = index + 1;
        const uid = `="${santri.uid}"`;
        const nama = `"${santri.nama.replace(/"/g, '""')}"`;
        const kamar = `"${santri.kamar.replace(/"/g, '""')}"`;
        
        const log = todayLogs.find(l => l.uid.toLowerCase() === santri.uid.toLowerCase());
        const status = log ? `"HADIR"` : `"BELUM ABSEN"`;
        const waktu = log ? `"${log.waktu}"` : `"-"`;

        csvContent += `${no},${uid},${nama},${kamar},${status},${waktu}\n`;
    });

    downloadCSV(csvContent, `Rekap_Kehadiran_Semua_Al-Fajr_${dateStr}.csv`);
};

/**
 * Helper pengunduh file CSV dengan UTF-8 BOM
 */
function downloadCSV(csvContent, fileName) {
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/* ==========================================================================
   8. LIVE DIGITAL CLOCK & DATE
   ========================================================================== */

function initClock() {
    const clockTimeEl = document.getElementById("liveClockTime");
    const clockDateEl = document.getElementById("liveClockDate");

    function update() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const dateStr = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short", year: "numeric" });

        if (clockTimeEl) clockTimeEl.textContent = `${timeStr} WIB`;
        if (clockDateEl) clockDateEl.textContent = dateStr;
    }

    update();
    setInterval(update, 1000);
}

/* ==========================================================================
   9. WEB AUDIO SYNTHESIZER (SOUND EFFECTS)
   ========================================================================== */

function playScanSound(isSuccess) {
    if (!isSoundEnabled) return;

    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (isSuccess) {
            // Success Beep: Melodic dual chime (880Hz -> 1318.5Hz)
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(1318.5, now + 0.08);

            gainNode.gain.setValueAtTime(0.18, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

            osc.start(now);
            osc.stop(now + 0.3);
        } else {
            // Warning/Error Buzz
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.linearRampToValueAtTime(180, now + 0.22);

            gainNode.gain.setValueAtTime(0.2, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

            osc.start(now);
            osc.stop(now + 0.26);
        }
    } catch (e) {
        console.warn("Audio Context tidak dapat diaktifkan:", e);
    }
}

function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
    if (soundIconOn && soundIconOff) {
        soundIconOn.style.display = isSoundEnabled ? "block" : "none";
        soundIconOff.style.display = isSoundEnabled ? "none" : "block";
    }
}
