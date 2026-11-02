/* ============================================================
   app.js — DompetKampus Student Finance Dashboard
   Vanilla JavaScript murni — tidak ada library eksternal.
   Semua logika UI, data, dan event listener ada di file ini.
============================================================ */

/* ============================================================
  KONFIGURASI & DATA AWAL
============================================================ */

/*
 * BUDGET_JAJAN sudah tidak dipakai untuk KPI Uang Jajan Tersisa.
 * KPI kini dihitung dinamis: Pemasukan − Pengeluaran (= saldo bersih).
 * Konstanta ini dipertahankan jika diperlukan kembali di masa depan.
 */
// const BUDGET_JAJAN = 500_000;  /* tidak aktif — lihat updateKPI() */

/**
 * Metadata setiap kategori:
 * label  — teks yang tampil
 * emoji  — ikon
 * color  — warna bar chart
 * cls    — CSS class badge di tabel
 */
const KATEGORI_META = {
  makan:      { label: 'Makan',      emoji: '🍜', color: '#F97316', cls: 'cat-makan'      },
  transport:  { label: 'Transport',  emoji: '🚌', color: '#3B82F6', cls: 'cat-transport'  },
  hiburan:    { label: 'Hiburan',    emoji: '🎮', color: '#8B5CF6', cls: 'cat-hiburan'    },
  belanja:    { label: 'Belanja',    emoji: '🛒', color: '#10B981', cls: 'cat-belanja'    },
  pendidikan: { label: 'Pendidikan', emoji: '📚', color: '#0EA5E9', cls: 'cat-pendidikan' },
  lainnya:    { label: 'Lainnya',    emoji: '📦', color: '#94A3B8', cls: 'cat-lainnya'    },
};

/**
 * Judul halaman per seksi navigasi.
 * Nilai adalah string HTML — span dirender oleh JS.
 */
const SECTION_TITLES = {
  overview:  'Overview <span>📊</span>',
  transaksi: 'Transaksi <span>💳</span>',
  target:    'Target Tabungan <span>🎯</span>',
};

/* ── State aplikasi ── */

/**
 * Array utama transaksi. Dipersistensikan ke localStorage
 * dengan key 'dk_v3_transactions'.
 * @type {Array<{id:number, nama:string, nominal:number, kategori:string, tipe:'income'|'expense'}>}
 */
let transactions = loadFromStorage();

/** ID auto-increment untuk setiap transaksi baru. */
let nextId = Math.max(0, ...transactions.map(t => t.id)) + 1;

/** Tipe yang dipilih di form modal ('income' | 'expense'). */
let selectedType = 'income';

/* ============================================================
  UTILITAS
============================================================ */

/**
 * Format angka ke format Rupiah Indonesia.
 * Contoh: 150000 → "Rp 150.000"
 * @param {number} angka
 * @returns {string}
 */
function formatRupiah(angka) {
  return 'Rp ' + Math.abs(angka).toLocaleString('id-ID');
}

/**
 * Tampilkan notifikasi toast singkat.
 * @param {string} pesan
 * @param {'success'|'error'|'info'} tipe
 */
function showToast(pesan, tipe = 'success') {
  const IKON = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${tipe}`;
  el.textContent = IKON[tipe] + ' ' + pesan;
  document.getElementById('toastContainer').appendChild(el);
  // Hapus elemen setelah animasi selesai (3.2 detik)
  setTimeout(() => el.remove(), 3200);
}

/**
 * Simpan transaksi ke localStorage.
 */
function saveToStorage() {
  try {
    localStorage.setItem('dk_v3_transactions', JSON.stringify(transactions));
  } catch (e) {
    // Jika storage penuh atau diblokir, lanjutkan tanpa crash
    console.warn('localStorage tidak tersedia:', e);
  }
}

/**
 * Muat transaksi dari localStorage.
 * Jika tidak ada / gagal parse, kembalikan 1 data awal (pemasukan).
 *
 * Catatan keamanan numerik:
 *   Data dari JSON.parse() bisa berupa string jika disimpan tidak konsisten.
 *   Oleh karena itu setiap `nominal` disanitasi dengan Number() di sini
 *   agar updateKPI() dan chart selalu menerima tipe number yang benar.
 *
 * @returns {Array<{id:number, nama:string, nominal:number, kategori:string, tipe:string}>}
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem('dk_v3_transactions');
    if (raw) {
      const parsed = JSON.parse(raw);
      /*
       * Sanitasi: pastikan setiap nominal adalah number.
       * Number('25000') → 25000 ✓
       * Number(25000)   → 25000 ✓
       * Number(undefined) → NaN, maka fallback ke 0
       */
      return parsed.map(t => ({
        ...t,
        id:      parseInt(t.id, 10)       || 0,
        nominal: Math.floor(Number(t.nominal)) || 0,
      }));
    }
  } catch (e) {
    console.warn('Gagal memuat data lokal:', e);
  }
  /* Data awal — 1 baris pemasukan agar saldo tidak 0 saat pertama dibuka */
  return [
    { id: 1, nama: 'Uang Bulanan', nominal: 1500000, kategori: 'lainnya', tipe: 'income' },
  ];
}

/* ============================================================
  PERHITUNGAN & RENDER KPI
============================================================ */

/**
 * Hitung ulang semua KPI dan perbarui DOM.
 * Dipanggil setiap kali data berubah.
 */
function updateKPI() {
  /*
   * Setiap t.nominal dilewatkan ke Number() terlebih dahulu.
   * Ini mencegah bug string-concatenation (cth: "1000" + 500 = "1000500")
   * yang bisa terjadi jika data dimuat dari localStorage sebagai string.
   */

  /* Total pemasukan: jumlahkan semua nominal bertipe 'income' */
  const totalIncome = transactions
    .filter(t => t.tipe === 'income')
    .reduce((sum, t) => sum + Number(t.nominal), 0);

  /* Total pengeluaran: jumlahkan semua nominal bertipe 'expense' */
  const totalExpense = transactions
    .filter(t => t.tipe === 'expense')
    .reduce((sum, t) => sum + Number(t.nominal), 0);

  /*
   * Saldo bersih = Pemasukan − Pengeluaran.
   * Nilai bisa negatif jika pengeluaran melebihi pemasukan.
   */
  const saldo = totalIncome - totalExpense;

  /*
   * Uang Jajan Tersisa = Pemasukan − Pengeluaran (saldo bersih).
   * Logika ini menggantikan kalkulasi berbasis BUDGET_JAJAN yang statis.
   * Ketika belum ada transaksi, totalIncome=0 dan totalExpense=0 → sisaJajan=0.
   * Math.max(0, ...) agar tidak muncul nilai negatif di kartu.
   */
  const sisaJajan = Math.max(0, saldo);

  /* Perbarui teks di DOM */
  document.getElementById('kpiSaldo').textContent   = formatRupiah(saldo);
  document.getElementById('kpiIncome').textContent  = formatRupiah(totalIncome);
  document.getElementById('kpiExpense').textContent = formatRupiah(totalExpense);
  document.getElementById('kpiJajan').textContent   = formatRupiah(sisaJajan);

  /* Badge count dan keterangan tambahan */
  const jumlahIncome  = transactions.filter(t => t.tipe === 'income').length;
  const jumlahExpense = transactions.filter(t => t.tipe === 'expense').length;
  document.getElementById('kpiIncomeBadge').textContent  = jumlahIncome  + ' transaksi';
  document.getElementById('kpiExpenseBadge').textContent = jumlahExpense + ' transaksi';
  /* Badge jajan menampilkan label dinamis berdasarkan saldo */
  document.getElementById('kpiJajanBadge').textContent   =
    saldo >= 0 ? 'saldo tersisa' : 'saldo minus';

  /* Warna saldo: biru jika positif, merah jika negatif */
  const elSaldo = document.getElementById('kpiSaldo');
  elSaldo.style.color = saldo >= 0 ? 'var(--blue)' : 'var(--red)';
}

/* ============================================================
  BAR CHART HORIZONTAL
  Lebar setiap bar diatur oleh JS berdasarkan persentase
  pengeluaran per kategori terhadap total pengeluaran.
============================================================ */

/**
 * Render chart pengeluaran per kategori ke #chartBody.
 * Bar menggunakan CSS width yang diset secara dinamis oleh JS.
 */
function renderChart() {
  /* Kumpulkan total pengeluaran per kategori */
  const totalPerKat = {};
  transactions
    .filter(t => t.tipe === 'expense')
    .forEach(t => {
      totalPerKat[t.kategori] = (totalPerKat[t.kategori] || 0) + t.nominal;
    });

  const entries    = Object.entries(totalPerKat).sort((a, b) => b[1] - a[1]);
  const grandTotal = entries.reduce((s, [, v]) => s + v, 0);
  const container  = document.getElementById('chartBody');

  /* Kosong — tampilkan pesan */
  if (entries.length === 0) {
    container.innerHTML =
      '<p style="font-size:13px;color:var(--muted);text-align:center;padding:28px 0;">Belum ada pengeluaran.</p>';
    return;
  }

  /* Bangun HTML setiap bar menggunakan template string */
  const html = entries.map(([kat, jumlah]) => {
    const meta = KATEGORI_META[kat] || { label: kat, emoji: '📦', color: '#94A3B8' };
    /* Persentase sebagai angka (0–100) — dipakai sebagai lebar bar */
    const persen = grandTotal > 0 ? ((jumlah / grandTotal) * 100).toFixed(1) : 0;

    return `
      <div class="chart-row">
        <div class="chart-meta">
          <span class="chart-cat" style="color:${meta.color}">
            ${meta.emoji} ${meta.label}
          </span>
          <span class="chart-amt">
            ${formatRupiah(jumlah)}
            <span class="chart-info">(${persen}%)</span>
          </span>
        </div>
        <div class="bar-track">
          <!--
            Lebar bar = ${persen}%
            Nilai ini dihitung JS dari: (jumlah / grandTotal) × 100
          -->
          <div
            class="bar-fill"
            style="width: ${persen}%; background: ${meta.color};"
            role="progressbar"
            aria-valuenow="${persen}"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="${meta.label}: ${persen}%"
          ></div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = html;
}

/* ============================================================
  TABEL TRANSAKSI
============================================================ */

/**
 * Render ulang seluruh isi tbody tabel overview.
 * Dipanggil setelah setiap perubahan data atau filter.
 */
function renderTable() {
  const tbody    = document.getElementById('transactionBody');
  const emptyRow = document.getElementById('emptyRow');
  const query    = document.getElementById('searchInput').value.trim().toLowerCase();

  /* Hapus semua baris kecuali sentinel */
  Array.from(tbody.querySelectorAll('tr:not(#emptyRow)')).forEach(r => r.remove());

  if (transactions.length === 0) {
    emptyRow.style.display = '';
    document.getElementById('tableCount').textContent = '0 transaksi';
    return;
  }

  emptyRow.style.display = 'none';

  /* Tampilkan terbaru di atas */
  let visibleCount = 0;
  [...transactions].reverse().forEach(t => {
    const meta     = KATEGORI_META[t.kategori] || KATEGORI_META.lainnya;
    const isIncome = t.tipe === 'income';

    /* Filter pencarian — cek nama & kategori */
    const matchSearch = !query ||
      t.nama.toLowerCase().includes(query) ||
      meta.label.toLowerCase().includes(query);

    const tr = document.createElement('tr');
    if (!matchSearch) tr.classList.add('row-hidden');
    else visibleCount++;

    tr.id = 'row-' + t.id;

    /* Buat sel tabel menggunakan innerHTML (konten dari escapeHtml, aman) */
    tr.innerHTML = `
      <td class="td-name">${escapeHtml(t.nama)}</td>
      <td>
        <span class="cat-badge ${meta.cls}">
          ${meta.emoji} ${meta.label}
        </span>
      </td>
      <td>
        <span class="${isIncome ? 'amt-income' : 'amt-expense'}">
          ${isIncome ? '📥 Masuk' : '📤 Keluar'}
        </span>
      </td>
      <td class="td-right ${isIncome ? 'amt-income' : 'amt-expense'}">
        ${isIncome ? '+' : '−'}${formatRupiah(t.nominal)}
      </td>
      <td class="td-right">
        <button
          class="btn-delete"
          type="button"
          aria-label="Hapus transaksi ${escapeHtml(t.nama)}"
          data-id="${t.id}"
        >Hapus</button>
      </td>`;

    tbody.insertBefore(tr, emptyRow);
  });

  /* Update badge count berdasarkan yang terlihat */
  const total = transactions.length;
  const shown = query ? visibleCount : total;
  document.getElementById('tableCount').textContent =
    query ? `${shown} dari ${total} transaksi` : `${total} transaksi`;
}

/**
 * Escape karakter HTML untuk mencegah XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/* ============================================================
  TAMBAH & HAPUS TRANSAKSI
============================================================ */

/**
 * Validasi input form, tambah transaksi ke array,
 * simpan ke storage, refresh UI, tutup modal.
 */
function addTransaction() {
  const nama     = document.getElementById('fNama').value.trim();
  const kategori = document.getElementById('fKategori').value;

  /*
   * parseFloat() mengonversi string input menjadi bilangan desimal.
   * Math.floor() membulatkan ke bawah ke bilangan bulat terdekat
   * sehingga nominal selalu bilangan bulat rupiah (tidak ada pecahan sen).
   * Contoh: parseFloat("25000.75") → 25000.75 → Math.floor → 25000
   */
  const nominal = Math.floor(parseFloat(document.getElementById('fNominal').value));

  /* ── Validasi ── */
  if (!nama) {
    showToast('Nama transaksi tidak boleh kosong!', 'error');
    document.getElementById('fNama').focus();
    return;
  }
  /*
   * Number.isFinite() memastikan nominal bukan Infinity / NaN.
   * Kondisi nominal <= 0 menolak 0 dan angka negatif.
   */
  if (!Number.isFinite(nominal) || nominal <= 0) {
    showToast('Nominal harus berupa angka lebih dari 0!', 'error');
    document.getElementById('fNominal').focus();
    return;
  }

  /* Tambah objek transaksi baru ke array state */
  transactions.push({
    id: nextId++,        /* ID unik auto-increment */
    nama,
    nominal,             /* sudah dijamin integer positif */
    kategori,
    tipe: selectedType,  /* 'income' atau 'expense' dari tombol toggle */
  });

  saveToStorage();
  refreshAll();
  closeModal();

  /* Reset form */
  document.getElementById('fNama').value     = '';
  document.getElementById('fNominal').value  = '';
  document.getElementById('fKategori').value = 'makan';
  setType('income');

  showToast(`"${nama}" berhasil ditambahkan!`);
}

/**
 * Hapus transaksi berdasarkan ID, simpan, refresh UI.
 * @param {number} id
 */
function deleteTransaction(id) {
  const target = transactions.find(t => t.id === id);
  if (!target) return; /* ID tidak ditemukan, abaikan */

  transactions = transactions.filter(t => t.id !== id);
  saveToStorage();
  refreshAll();

  showToast(`"${target.nama}" dihapus.`, 'info');
}

/**
 * Refresh semua komponen UI sekaligus:
 * KPI cards, bar chart, tabel Overview, dan tabel Transaksi penuh.
 */
function refreshAll() {
  updateKPI();
  renderChart();
  renderTable();
  renderTableFull();
}

/* ============================================================
  FILTER PENCARIAN (Real-time)
============================================================ */

/**
 * Filter baris tabel berdasarkan kata kunci di search box.
 * Merender ulang kedua tabel (overview + transaksi penuh).
 */
function filterTable() {
  renderTable();
  renderTableFull();
}

/* ============================================================
  MODAL TRANSAKSI
============================================================ */

/** Buka modal tambah transaksi. */
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  /* Fokus ke input pertama setelah animasi */
  setTimeout(() => document.getElementById('fNama').focus(), 230);
}

/** Tutup modal. */
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

/**
 * Pilih tipe transaksi (pemasukan / pengeluaran).
 * Perbarui visual tombol toggle.
 * @param {'income'|'expense'} tipe
 */
function setType(tipe) {
  selectedType = tipe;
  const btnIncome  = document.getElementById('typeBtnIncome');
  const btnExpense = document.getElementById('typeBtnExpense');

  /* Reset kedua tombol */
  btnIncome.className  = 'type-btn';
  btnExpense.className = 'type-btn';
  btnIncome.setAttribute('aria-pressed', 'false');
  btnExpense.setAttribute('aria-pressed', 'false');

  /* Aktifkan tombol yang dipilih */
  if (tipe === 'income') {
    btnIncome.className = 'type-btn sel-income';
    btnIncome.setAttribute('aria-pressed', 'true');
  } else {
    btnExpense.className = 'type-btn sel-expense';
    btnExpense.setAttribute('aria-pressed', 'true');
  }
}

/* ============================================================
  NAVIGASI SIDEBAR
============================================================ */

/**
 * Tampilkan satu section dan sembunyikan yang lain.
 * @param {string} sectionId - nilai data-section yang akan diaktifkan
 */
function showSection(sectionId) {
  /* Sembunyikan semua section */
  document.querySelectorAll('.page-section').forEach(sec => {
    sec.classList.remove('active');
  });
  /* Tampilkan section yang dipilih */
  const target = document.querySelector(`.page-section[data-section="${sectionId}"]`);
  if (target) target.classList.add('active');

  /* Perbarui judul topbar */
  document.getElementById('topbarTitle').innerHTML =
    SECTION_TITLES[sectionId] || sectionId;

  /* Render ulang data agar selalu segar */
  if (sectionId === 'overview' || sectionId === 'transaksi') {
    refreshAll();
  }
  if (sectionId === 'target') {
    renderTargets();
  }
}

/**
 * Setup event listener navigasi sidebar.
 * Saat menu diklik → ubah class active menu + tampilkan section yang sesuai.
 */
function setupNavigation() {
  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => {
      /* Hapus class active dari semua item nav */
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      /* Beri class active ke item yang diklik → background berubah warna */
      item.classList.add('active');
      /* Tampilkan section yang sesuai */
      showSection(item.dataset.section);
    });

    /* Aksesibilitas keyboard: Enter / Space */
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });
  });
}

/* ============================================================
  EVENT LISTENERS
============================================================ */

/**
 * Pasang semua event listener setelah DOM siap.
 */
function setupEventListeners() {
  /* Buka modal dari sidebar */
  document.getElementById('btnOpenModal')
    .addEventListener('click', openModal);

  /* Tutup modal via tombol ✕ */
  document.getElementById('btnCloseModal')
    .addEventListener('click', closeModal);

  /* Tutup modal via tombol Batal */
  document.getElementById('btnCancel')
    .addEventListener('click', closeModal);

  /* Submit form */
  document.getElementById('btnSubmit')
    .addEventListener('click', addTransaction);

  /* Tutup modal saat klik di luar (overlay) */
  document.getElementById('modalOverlay')
    .addEventListener('click', e => {
      if (e.target === document.getElementById('modalOverlay')) {
        closeModal();
      }
    });

  /* Keyboard global */
  document.addEventListener('keydown', e => {
    const modalOpen = document.getElementById('modalOverlay').classList.contains('open');
    if (e.key === 'Escape' && modalOpen) closeModal();
    if (e.key === 'Enter'  && modalOpen) addTransaction();
  });

  /* Pencarian real-time */
  document.getElementById('searchInput')
    .addEventListener('input', filterTable);

  /*
   * Event delegation tombol Hapus — tabel overview.
   * Lebih efisien daripada memasang listener per-baris.
   */
  document.getElementById('transactionBody')
    .addEventListener('click', e => {
      const btn = e.target.closest('.btn-delete');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      if (!Number.isNaN(id)) deleteTransaction(id);
    });

  /* Event delegation tombol Hapus — tabel transaksi penuh */
  document.getElementById('transactionBodyFull')
    .addEventListener('click', e => {
      const btn = e.target.closest('.btn-delete');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      if (!Number.isNaN(id)) deleteTransaction(id);
    });

  /* ── Modal Edit Target ── */
  document.getElementById('btnCloseEdit')
    .addEventListener('click', closeEditTarget);
  document.getElementById('btnCancelEdit')
    .addEventListener('click', closeEditTarget);
  document.getElementById('btnSaveEdit')
    .addEventListener('click', saveEditTarget);

  /* Tutup modal edit saat klik overlay */
  document.getElementById('editTargetOverlay')
    .addEventListener('click', e => {
      if (e.target === document.getElementById('editTargetOverlay')) closeEditTarget();
    });

  /* Live preview progress bar saat user mengetik nominal baru */
  document.getElementById('editTargetInput')
    .addEventListener('input', function () {
      const idx   = parseInt(document.getElementById('editTargetIndex').value, 10);
      const t     = TARGET_DATA[idx];
      const nilai = parseFloat(this.value) || 0;
      if (t) updateEditPreview(nilai, t.target);
    });

  /* Enter di input edit = simpan; Escape = tutup */
  document.getElementById('editTargetInput')
    .addEventListener('keydown', e => {
      if (e.key === 'Enter')  saveEditTarget();
      if (e.key === 'Escape') closeEditTarget();
    });

  /* ── Modal Tambah Target ── */
  document.getElementById('btnOpenAddTarget')
    .addEventListener('click', openAddTarget);
  document.getElementById('btnCloseAddTarget')
    .addEventListener('click', closeAddTarget);
  document.getElementById('btnCancelAddTarget')
    .addEventListener('click', closeAddTarget);
  document.getElementById('btnSaveAddTarget')
    .addEventListener('click', saveAddTarget);

  /* Tutup modal tambah saat klik overlay */
  document.getElementById('addTargetOverlay')
    .addEventListener('click', e => {
      if (e.target === document.getElementById('addTargetOverlay')) closeAddTarget();
    });

  /* Enter di input nama/nominal tambah target = simpan */
  ['newTargetNama', 'newTargetNominal', 'newTargetEmoji'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter')  saveAddTarget();
      if (e.key === 'Escape') closeAddTarget();
    });
  });
}

/* ============================================================
  TABEL TRANSAKSI PENUH (Halaman Transaksi)
  Menampilkan semua transaksi dalam tabel besar dengan kolom #
============================================================ */

/**
 * Render tabel transaksi penuh di halaman Transaksi.
 * Sinkron dengan searchInput dan data transactions.
 */
function renderTableFull() {
  const tbody    = document.getElementById('transactionBodyFull');
  const emptyRow = document.getElementById('emptyRowFull');
  const query    = document.getElementById('searchInput').value.trim().toLowerCase();

  /* Hapus semua baris kecuali sentinel */
  Array.from(tbody.querySelectorAll('tr:not(#emptyRowFull)')).forEach(r => r.remove());

  if (transactions.length === 0) {
    emptyRow.style.display = '';
    document.getElementById('tableCountTx').textContent = '0 transaksi';
    return;
  }

  emptyRow.style.display = 'none';
  let visibleCount = 0;

  /* Tampilkan terbaru di atas; nomor urut dihitung dari akhir */
  const reversed = [...transactions].reverse();
  reversed.forEach((t, idx) => {
    const meta     = KATEGORI_META[t.kategori] || KATEGORI_META.lainnya;
    const isIncome = t.tipe === 'income';
    const nomor    = reversed.length - idx; /* nomor urut asli */

    /* Filter pencarian */
    const matchSearch = !query ||
      t.nama.toLowerCase().includes(query) ||
      meta.label.toLowerCase().includes(query);

    const tr = document.createElement('tr');
    if (!matchSearch) tr.classList.add('row-hidden');
    else visibleCount++;

    tr.id = 'rowFull-' + t.id;
    tr.innerHTML = `
      <td style="color:var(--muted);font-weight:600;font-size:12px;">${nomor}</td>
      <td class="td-name">${escapeHtml(t.nama)}</td>
      <td><span class="cat-badge ${meta.cls}">${meta.emoji} ${meta.label}</span></td>
      <td>
        <span class="${isIncome ? 'amt-income' : 'amt-expense'}">
          ${isIncome ? '📥 Masuk' : '📤 Keluar'}
        </span>
      </td>
      <td class="td-right ${isIncome ? 'amt-income' : 'amt-expense'}">
        ${isIncome ? '+' : '−'}${formatRupiah(t.nominal)}
      </td>
      <td class="td-right">
        <button
          class="btn-delete"
          type="button"
          aria-label="Hapus ${escapeHtml(t.nama)}"
          data-id="${t.id}"
        >Hapus</button>
      </td>`;
    tbody.insertBefore(tr, emptyRow);
  });

  const total = transactions.length;
  const shown = query ? visibleCount : total;
  document.getElementById('tableCountTx').textContent =
    query ? `${shown} dari ${total} transaksi` : `${total} transaksi`;
}

/* ============================================================
  HALAMAN TARGET TABUNGAN
  Data dummy + progress bar kapsul
============================================================ */

/**
 * Data target tabungan — disimpan sebagai `let` agar nilai `terkumpul`
 * dapat diperbarui oleh user melalui tombol Edit.
 * Persisten ke localStorage dengan key 'dk_v3_targets'.
 * Struktur setiap objek:
 *   nama      {string}  — nama tujuan tabungan
 *   emoji     {string}  — ikon dekoratif
 *   target    {number}  — total nominal yang ingin dicapai
 *   terkumpul {number}  — nominal yang sudah terkumpul (dapat diedit)
 *   deadline  {string}  — label target waktu
 *   color     {string}  — CSS gradient untuk progress bar
 */
let TARGET_DATA = (function () {
  try {
    const raw = localStorage.getItem('dk_v3_targets');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* abaikan */ }
  return [
    {
      nama:      'Beli Laptop',
      emoji:     '💻',
      target:    10000000,
      terkumpul: 5000000,
      deadline:  'Des 2026',
      color:     'linear-gradient(90deg, #3B82F6, #60A5FA)',
    },
    {
      nama:      'Dana Darurat',
      emoji:     '🛡️',
      target:    6000000,
      terkumpul: 4200000,
      deadline:  'Feb 2027',
      color:     'linear-gradient(90deg, #10B981, #34D399)',
    },
    {
      nama:      'Liburan Bali',
      emoji:     '🏖️',
      target:    3500000,
      terkumpul: 700000,
      deadline:  'Jul 2027',
      color:     'linear-gradient(90deg, #F59E0B, #FCD34D)',
    },
  ];
})();

/** Simpan TARGET_DATA ke localStorage */
function saveTargets() {
  try {
    localStorage.setItem('dk_v3_targets', JSON.stringify(TARGET_DATA));
  } catch (e) { /* abaikan */ }
}

/**
 * Buka modal edit untuk target ke-`idx`.
 * Menampilkan form isian nominal terkumpul baru,
 * lalu memperbarui progress bar & persentase secara real-time.
 * @param {number} idx - indeks di TARGET_DATA
 */
function editTarget(idx) {
  const t = TARGET_DATA[idx];
  if (!t) return;

  /* Isi modal edit */
  document.getElementById('editTargetTitle').textContent = t.emoji + ' ' + t.nama;
  document.getElementById('editTargetMax').textContent   = formatRupiah(t.target);
  document.getElementById('editTargetInput').value       = t.terkumpul;
  document.getElementById('editTargetIndex').value       = idx;

  /* Tampilkan preview progress saat ini */
  updateEditPreview(t.terkumpul, t.target);

  document.getElementById('editTargetOverlay').classList.add('open');
  setTimeout(() => document.getElementById('editTargetInput').select(), 200);
}

/**
 * Perbarui preview progress bar & teks persentase di modal edit secara live.
 * Dipanggil setiap kali user mengubah isi input nominal.
 *
 * @param {number} terkumpul - nominal yang sudah terkumpul (dari input user)
 * @param {number} target    - total nominal yang harus dicapai
 */
function updateEditPreview(terkumpul, target) {
  /*
   * Rumus persentase: (terkumpul / target) × 100
   * Number() memastikan keduanya bertipe number sebelum dibagi.
   * Math.round() membulatkan ke integer terdekat.
   * Math.min(100, ...) membatasi maksimum 100% (tidak bisa over 100%).
   * Math.max(0,  ...) membatasi minimum 0%   (tidak bisa negatif).
   */
  const persen = Math.min(100, Math.max(0,
    Math.round((Number(terkumpul) / Number(target)) * 100)
  ));

  /* Update lebar bar kapsul (dinyatakan dalam %) */
  document.getElementById('editPreviewFill').style.width = persen + '%';

  /* Update teks persentase di sebelah kanan */
  document.getElementById('editPreviewPct').textContent  = persen + '%';

  /* Update teks nominal "X dari Y" di bawah bar */
  document.getElementById('editPreviewNom').textContent  =
    formatRupiah(Number(terkumpul)) + ' dari ' + formatRupiah(Number(target));
}

/**
 * Simpan perubahan nominal terkumpul dari modal edit.
 * Dipanggil oleh tombol "Simpan" atau tombol Enter di input.
 */
function saveEditTarget() {
  /*
   * parseInt(..., 10) membaca indeks sebagai bilangan bulat basis 10.
   * Radix 10 ditulis eksplisit agar tidak salah interpretasi
   * (tanpa radix, string "09" bisa dibaca oktal di browser lama).
   */
  const idx = parseInt(document.getElementById('editTargetIndex').value, 10);

  /*
   * parseFloat → ambil nilai desimal dari input.
   * Math.floor → bulatkan ke bawah ke bilangan bulat rupiah.
   * Contoh: "3500000.9" → 3500000
   */
  const nominal = Math.floor(parseFloat(document.getElementById('editTargetInput').value));

  const t = TARGET_DATA[idx];

  /* Guard: indeks tidak valid */
  if (!t) return;

  /* Validasi: nominal harus angka yang bisa dihitung (bukan NaN) dan ≥ 0 */
  if (!Number.isFinite(nominal) || nominal < 0) {
    showToast('Nominal tidak valid! Masukkan angka ≥ 0.', 'error');
    return;
  }

  /* Validasi: nominal tidak boleh melebihi total target */
  if (nominal > Number(t.target)) {
    showToast(`Nominal melebihi target (${formatRupiah(t.target)})!`, 'error');
    return;
  }

  /* Perbarui data dan simpan ke localStorage */
  TARGET_DATA[idx].terkumpul = nominal;
  saveTargets();

  /* Tutup modal, render ulang kartu, tampilkan konfirmasi */
  closeEditTarget();
  renderTargets();
  showToast(`Target "${t.nama}" diperbarui ke ${formatRupiah(nominal)}!`);
}

/** Tutup modal edit target */
function closeEditTarget() {
  document.getElementById('editTargetOverlay').classList.remove('open');
}

/* ============================================================
  TAMBAH & HAPUS TARGET TABUNGAN
============================================================ */

/** Warna gradient yang dirotasi untuk setiap target baru */
const TARGET_COLORS = [
  'linear-gradient(90deg, #3B82F6, #60A5FA)',
  'linear-gradient(90deg, #10B981, #34D399)',
  'linear-gradient(90deg, #F59E0B, #FCD34D)',
  'linear-gradient(90deg, #8B5CF6, #C4B5FD)',
  'linear-gradient(90deg, #EF4444, #FCA5A5)',
  'linear-gradient(90deg, #06B6D4, #67E8F9)',
];

/** Buka modal tambah target */
function openAddTarget() {
  /* Kosongkan form setiap kali modal dibuka */
  document.getElementById('newTargetNama').value    = '';
  document.getElementById('newTargetNominal').value = '';
  document.getElementById('newTargetEmoji').value   = '';
  document.getElementById('addTargetOverlay').classList.add('open');
  setTimeout(() => document.getElementById('newTargetNama').focus(), 200);
}

/** Tutup modal tambah target */
function closeAddTarget() {
  document.getElementById('addTargetOverlay').classList.remove('open');
}

/**
 * Simpan target baru ke TARGET_DATA, render ulang, tutup modal.
 * Progress bar dimulai dari 0% karena terkumpul = 0.
 */
function saveAddTarget() {
  const nama    = document.getElementById('newTargetNama').value.trim();
  const nominal = Math.floor(parseFloat(document.getElementById('newTargetNominal').value));
  const emoji   = document.getElementById('newTargetEmoji').value.trim() || '🎯';

  /* Validasi nama */
  if (!nama) {
    showToast('Nama target tidak boleh kosong!', 'error');
    document.getElementById('newTargetNama').focus();
    return;
  }
  /* Validasi nominal: harus angka finite > 0 */
  if (!Number.isFinite(nominal) || nominal <= 0) {
    showToast('Nominal target harus lebih dari 0!', 'error');
    document.getElementById('newTargetNominal').focus();
    return;
  }

  /*
   * Pilih warna gradient secara bergiliran (modulo jumlah warna tersedia).
   * TARGET_DATA.length sebelum push = indeks target baru yang akan dibuat.
   */
  const colorIdx = TARGET_DATA.length % TARGET_COLORS.length;

  /* Tambah ke array — terkumpul dimulai dari 0 → progress bar 0% */
  TARGET_DATA.push({
    nama,
    emoji,
    target:    nominal,
    terkumpul: 0,
    deadline:  'Belum diset',
    color:     TARGET_COLORS[colorIdx],
  });

  saveTargets();    /* simpan ke localStorage agar persisten */
  closeAddTarget(); /* tutup modal form */
  renderTargets();  /* render ulang grid termasuk kartu baru */
  showToast(`Target "${nama}" berhasil ditambahkan!`);
}

/**
 * Hapus target berdasarkan indeks dari TARGET_DATA.
 * Kartu akan langsung hilang dari layar setelah dikonfirmasi.
 * @param {number} idx - indeks elemen di array TARGET_DATA
 */
function deleteTarget(idx) {
  const t = TARGET_DATA[idx];
  if (!t) return;

  /* Minta konfirmasi user sebelum menghapus data permanen */
  const yakin = window.confirm(`Hapus target "${t.nama}"?\nTindakan ini tidak bisa dibatalkan.`);
  if (!yakin) return;

  /* Array.splice(idx, 1) menghapus tepat 1 elemen pada indeks tersebut */
  TARGET_DATA.splice(idx, 1);
  saveTargets();   /* perbarui localStorage setelah penghapusan */
  renderTargets(); /* render ulang grid tanpa kartu yang dihapus */
  showToast(`Target "${t.nama}" dihapus.`, 'info');
}

/**
 * Render ulang seluruh grid kartu Target Tabungan menggunakan
 * Vanilla JavaScript DOM manipulation murni (createElement + appendChild).
 *
 * Dipanggil setiap kali TARGET_DATA berubah:
 *   - Saat halaman Target pertama kali dibuka  (showSection)
 *   - Setelah target baru ditambahkan          (saveAddTarget)
 *   - Setelah target dihapus                   (deleteTarget)
 *   - Setelah nominal terkumpul diedit         (saveEditTarget)
 */
function renderTargets() {
  /* ── Ambil elemen kontainer dari DOM ── */
  const grid    = document.getElementById('targetGrid');
  const summary = document.getElementById('targetSummary');

  /*
   * Kosongkan isi grid terlebih dahulu sebelum mengisi ulang.
   * Ini menghindari kartu duplikat saat render dipanggil berkali-kali.
   * innerHTML = '' adalah cara paling ringkas di Vanilla JS.
   */
  grid.innerHTML = '';

  /* ── Tampilkan pesan kosong jika belum ada target ── */
  if (TARGET_DATA.length === 0) {
    /* Buat elemen paragraf kosong menggunakan createElement */
    const empty = document.createElement('p');
    empty.style.cssText = 'color:var(--muted);font-size:13px;grid-column:1/-1;text-align:center;padding:32px 0;';
    empty.textContent = '📭 Belum ada target tabungan. Klik "+ Tambah Target" untuk memulai.';
    grid.appendChild(empty); /* tempelkan ke dalam grid */
    summary.innerHTML = '';  /* hapus juga ringkasan total */
    return;
  }

  /*
   * Iterasi setiap item TARGET_DATA.
   * `idx` adalah indeks array — dipakai sebagai argumen editTarget(idx)
   * dan deleteTarget(idx) agar fungsi tahu kartu mana yang dioperasikan.
   */
  TARGET_DATA.forEach(function (t, idx) {

    /* ── 1. Konversi ke Number dan hitung persentase ── */
    /*
     * Number() memastikan nilai dari localStorage (yang bisa berupa string)
     * dikonversi ke tipe number sebelum operasi matematika.
     * Rumus: persen = (terkumpul / target) × 100
     * Math.min(100) → cap di 100%, Math.max(0) → tidak boleh negatif
     */
    const terkumpul = Number(t.terkumpul);
    const targetNom = Number(t.target);
    const persen    = Math.min(100, Math.max(0,
                        Math.round((terkumpul / targetNom) * 100)
                      ));
    const sisa      = targetNom - terkumpul; /* sisa yang masih perlu ditabung */
    const done      = persen >= 100;          /* true jika target sudah tercapai */
    const onTrack   = persen >= 50;           /* true jika sudah lebih dari separuh */

    /* ── 2. Tentukan kelas & teks badge status ── */
    const statusCls  = done      ? 'status-done'
                     : onTrack   ? 'status-on-track'
                     :             'status-behind';
    const statusText = done      ? '🎉 Tercapai!'
                     : onTrack   ? '✅ Sesuai Target'
                     :             '⚠️ Perlu Ditingkatkan';

    /* ── 3. Tentukan warna berdasarkan progres ── */
    const persenColor = done    ? 'var(--blue)'
                      : onTrack ? 'var(--green)'
                      :           'var(--yellow)';
    const emojiBg     = done    ? '#DBEAFE'
                      : onTrack ? '#D1FAE5'
                      :           '#FEF3C7';

    /* ════════════════════════════════════════════════════
     * Bangun struktur DOM kartu menggunakan createElement.
     * Urutan:
     *   .target-card
     *     ├─ .target-card-top          (nama, emoji, persen)
     *     ├─ .target-bar-track         (progress bar kapsul)
     *     │    └─ .target-bar-fill     (lebar diset JS = persen%)
     *     ├─ .target-nominal-row       (terkumpul, sisa)
     *     ├─ div aksi                  (badge status, tombol Edit & Hapus)
     *     └─ div footer               (keterangan total target)
     * ════════════════════════════════════════════════════ */

    /* ── Kartu utama ── */
    const card = document.createElement('div');
    card.className = 'target-card';
    card.id        = 'target-card-' + idx;

    /* ── Baris atas: emoji | nama & deadline | persentase ── */
    const cardTop = document.createElement('div');
    cardTop.className = 'target-card-top';

    /* Sisi kiri: ikon emoji + nama + deadline */
    const cardLeft = document.createElement('div');
    cardLeft.className = 'target-card-left';

    const emojiBox = document.createElement('div');
    emojiBox.className        = 'target-emoji';
    emojiBox.style.background = emojiBg;
    emojiBox.textContent      = t.emoji; /* textContent aman dari XSS */

    const nameWrap = document.createElement('div');

    const nameEl = document.createElement('div');
    nameEl.className   = 'target-name';
    nameEl.textContent = t.nama; /* .textContent otomatis escape HTML */

    const deadlineEl = document.createElement('div');
    deadlineEl.className   = 'target-deadline';
    deadlineEl.textContent = '⏱ Target: ' + t.deadline;

    nameWrap.appendChild(nameEl);
    nameWrap.appendChild(deadlineEl);
    cardLeft.appendChild(emojiBox);
    cardLeft.appendChild(nameWrap);

    /* Sisi kanan: angka persentase */
    const persenEl = document.createElement('div');
    persenEl.className   = 'target-persen';
    persenEl.style.color = persenColor;
    persenEl.textContent = persen + '%';

    cardTop.appendChild(cardLeft);
    cardTop.appendChild(persenEl);

    /* ── Progress bar kapsul ── */
    const barTrack = document.createElement('div');
    barTrack.className = 'target-bar-track';

    const barFill = document.createElement('div');
    barFill.className = 'target-bar-fill';
    /*
     * Lebar bar diset langsung oleh JavaScript di sini.
     * Contoh: persen=50 → style.width = "50%"
     * CSS transition pada .target-bar-fill membuat animasi halus.
     */
    barFill.style.width      = persen + '%';
    barFill.style.background = t.color;
    /* Atribut aksesibilitas ARIA untuk screen reader */
    barFill.setAttribute('role',           'progressbar');
    barFill.setAttribute('aria-valuenow',   String(persen));
    barFill.setAttribute('aria-valuemin',   '0');
    barFill.setAttribute('aria-valuemax',   '100');
    barFill.setAttribute('aria-label',      t.nama + ': ' + persen + '%');

    barTrack.appendChild(barFill);

    /* ── Baris nominal: terkumpul & sisa ── */
    const nomRow = document.createElement('div');
    nomRow.className = 'target-nominal-row';

    const terkumpulEl = document.createElement('span');
    terkumpulEl.className   = 'target-terkumpul';
    terkumpulEl.style.color = persenColor;
    terkumpulEl.textContent = formatRupiah(terkumpul) + ' terkumpul';

    const sisaEl = document.createElement('span');
    sisaEl.className   = 'target-sisa';
    sisaEl.textContent = done ? 'Lunas 🎊' : 'Sisa ' + formatRupiah(sisa);

    nomRow.appendChild(terkumpulEl);
    nomRow.appendChild(sisaEl);

    /* ── Baris aksi: badge status + tombol Edit & Hapus ── */
    const aksiRow = document.createElement('div');
    aksiRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:10px;flex-wrap:wrap;gap:8px;';

    /* Badge status */
    const statusBadge = document.createElement('span');
    statusBadge.className   = 'target-status ' + statusCls;
    statusBadge.textContent = statusText;

    /* Kelompok tombol */
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;gap:8px;';

    /*
     * Tombol Edit — menggunakan addEventListener (bukan onclick di HTML).
     * Indeks `idx` ditangkap oleh closure sehingga selalu merujuk
     * ke target yang benar meskipun kartu lain dihapus kemudian.
     */
    const btnEdit = document.createElement('button');
    btnEdit.type        = 'button';
    btnEdit.className   = 'btn-edit-target';
    btnEdit.textContent = '✏️ Edit';
    btnEdit.setAttribute('aria-label', 'Edit nominal terkumpul untuk ' + t.nama);
    btnEdit.addEventListener('click', function () {
      /* Panggil editTarget dengan indeks kartu ini */
      editTarget(idx);
    });

    /*
     * Tombol Hapus — menggunakan addEventListener (bukan onclick di HTML).
     * Memanggil deleteTarget(idx) yang akan:
     *   1. Tampilkan confirm dialog
     *   2. splice TARGET_DATA pada indeks ini
     *   3. Simpan ke localStorage
     *   4. Panggil renderTargets() ulang
     */
    const btnHapus = document.createElement('button');
    btnHapus.type        = 'button';
    btnHapus.className   = 'btn-delete';
    btnHapus.textContent = '🗑 Hapus';
    btnHapus.setAttribute('aria-label', 'Hapus target ' + t.nama);
    btnHapus.addEventListener('click', function () {
      /* Panggil deleteTarget dengan indeks kartu ini */
      deleteTarget(idx);
    });

    btnGroup.appendChild(btnEdit);
    btnGroup.appendChild(btnHapus);
    aksiRow.appendChild(statusBadge);
    aksiRow.appendChild(btnGroup);

    /* ── Footer kartu: keterangan total target ── */
    const footer = document.createElement('div');
    footer.style.cssText = 'margin-top:10px;font-size:12px;color:var(--muted);';

    /* Teks "dari total target" */
    footer.appendChild(document.createTextNode('dari total target '));

    /* Nominal target di-bold menggunakan createElement */
    const boldTarget = document.createElement('strong');
    boldTarget.style.color = 'var(--text)';
    boldTarget.textContent = formatRupiah(targetNom);
    footer.appendChild(boldTarget);

    /* ── Rangkai semua bagian ke dalam kartu ── */
    card.appendChild(cardTop);
    card.appendChild(barTrack);
    card.appendChild(nomRow);
    card.appendChild(aksiRow);
    card.appendChild(footer);

    /* ── Tempel kartu ke dalam grid ── */
    grid.appendChild(card);

  }); /* akhir forEach TARGET_DATA */

  /* ════════════════════════════════════════════════════
   * Perbarui ringkasan total di bawah grid menggunakan innerHTML.
   * Konten ini bersifat statis (tidak ada input user), jadi
   * innerHTML aman digunakan di sini.
   * Number() di setiap reduce → jaminan tipe number dari localStorage.
   * ════════════════════════════════════════════════════ */
  const totalTarget    = TARGET_DATA.reduce(function (s, t) { return s + Number(t.target);    }, 0);
  const totalTerkumpul = TARGET_DATA.reduce(function (s, t) { return s + Number(t.terkumpul); }, 0);
  const totalSisa      = totalTarget - totalTerkumpul; /* nominal yang masih harus ditabung */

  summary.innerHTML =
    '<div class="target-sum-item">'                                              +
      '<div class="target-sum-label">Total Target</div>'                         +
      '<div class="target-sum-value" style="color:var(--text);">'                +
        formatRupiah(totalTarget)                                                +
      '</div>'                                                                   +
    '</div>'                                                                     +
    '<div class="target-sum-item">'                                              +
      '<div class="target-sum-label">Sudah Terkumpul</div>'                      +
      '<div class="target-sum-value" style="color:var(--green);">'              +
        formatRupiah(totalTerkumpul)                                             +
      '</div>'                                                                   +
    '</div>'                                                                     +
    '<div class="target-sum-item">'                                              +
      '<div class="target-sum-label">Masih Kurang</div>'                         +
      '<div class="target-sum-value" style="color:var(--red);">'                +
        formatRupiah(totalSisa)                                                  +
      '</div>'                                                                   +
    '</div>';
}

/* ============================================================
  INISIALISASI APLIKASI
============================================================ */

/**
 * Titik masuk utama — dipanggil sekali saat halaman dimuat.
 */
function init() {
  setupNavigation();
  setupEventListeners();
  refreshAll(); /* render KPI, chart, tabel dengan data awal */
}

/* Jalankan init */
init();
