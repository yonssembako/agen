/**
 * YONS AGEN KASIR
 * Frontend JavaScript
 *
 * Petunjuk:
 * 1. Isi API_URL dengan URL Web App Apps Script.
 * 2. Pastikan deployment Apps Script sudah aktif.
 * 3. Pastikan ID elemen HTML sesuai dengan kode ini.
 */

// ============================================================
// 1. KONFIGURASI DAN STATE APLIKASI
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbyJ16xWIio6nqT9lYm5tdmGlURRpi3vc-34QWQkptULY8XKp0tZb69AVt1I0C3xo8Iz-w/exec';

const $ = (id) => document.getElementById(id);

const state = {
  password: '',
  products: [],
  customers: [],
  cart: [],
  lastReceipt: null,
  dashboard: null
};


// ============================================================
// 2. UTILITAS
// ============================================================

/**
 * Format angka menjadi mata uang Rupiah.
 */
const rupiah = (value) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
};


/**
 * Mengamankan teks sebelum dimasukkan ke HTML.
 */
const esc = (value) => {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
};


// ============================================================
// 3. API APPS SCRIPT
// ============================================================

/**
 * Mengirim permintaan ke backend Apps Script melalui JSONP.
 *
 * Catatan:
 * Metode ini mengikuti backend doGet() yang sudah tersedia.
 */
function api(action, data = {}) {
  return new Promise((resolve, reject) => {
    if (!API_URL.startsWith('https://script.google.com/')) {
      reject(
        new Error('URL Apps Script belum diisi di app.js.')
      );

      return;
    }

    const callback =
      'yonsCb_' +
      Date.now() +
      '_' +
      Math.floor(Math.random() * 100000);

    const script = document.createElement('script');

    const params = new URLSearchParams({
      action,
      callback,
      password: state.password,
      payload: JSON.stringify(data)
    });

    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    };

    const finish = (handler, value) => {
      if (settled) return;

      settled = true;
      cleanup();
      handler(value);
    };

    const timer = setTimeout(() => {
      finish(
        reject,
        new Error(
          'Koneksi timeout. Periksa URL dan deployment Apps Script.'
        )
      );
    }, 20000);

    window[callback] = (result) => {
      if (result && result.ok) {
        finish(resolve, result);
      } else {
        finish(
          reject,
          new Error(
            result?.error || 'Permintaan gagal.'
          )
        );
      }
    };

    script.src = API_URL + '?' + params.toString();

    script.onerror = () => {
      finish(
        reject,
        new Error('Gagal terhubung ke Apps Script.')
      );
    };

    document.body.appendChild(script);
  });
}


// ============================================================
// 4. LOGIN DAN LOGOUT
// ============================================================

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  state.password = $('password').value;

  $('loginMessage').textContent = 'Memeriksa password…';

  try {
    await api('login');

    $('loginScreen').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('loginMessage').textContent = '';

    await Promise.all([
      loadProducts(),
      loadCustomers(),
      loadDashboard()
    ]);

  } catch (error) {
    state.password = '';
    $('password').value = '';
    $('loginMessage').textContent = error.message;
  }
});


$('logoutBtn').onclick = () => {
  state.password = '';
  state.cart = [];
  state.lastReceipt = null;

  $('app').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('password').focus();
};


// ============================================================
// 5. NAVIGASI TAB
// ============================================================

document.querySelectorAll('.tab').forEach((button) => {
  button.onclick = () => {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('active', tab === button);
    });

    document.querySelectorAll('.page').forEach((page) => {
      page.classList.toggle(
        'hidden',
        page.id !== 'page-' + button.dataset.page
      );
    });

    if (button.dataset.page === 'kasir') {
      renderCart();
    }

    if (button.dataset.page === 'dashboard') {
      loadDashboard();
    }
  };
});


// ============================================================
// 6. DATA PRODUK
// ============================================================

$('refreshProducts').onclick = loadProducts;


/**
 * Mengambil data produk dari backend.
 */
async function loadProducts() {
  try {
    const result = await api('products');

    state.products = result.products || [];

    renderProducts();
    fillProductSelect();

  } catch (error) {
    $('productGrid').innerHTML =
      '<p class="muted">' +
      esc(error.message) +
      '</p>';
  }
}


/**
 * Menampilkan kartu produk.
 */
function renderProducts() {
  const grid = $('productGrid');

  if (!state.products.length) {
    grid.innerHTML =
      '<p class="muted">' +
      'Belum ada data produk. Tambahkan produk di sheet Produk.' +
      '</p>';

    return;
  }

  grid.innerHTML = state.products.map((product) => `
    <article class="product-card">
      <div style="display:flex;justify-content:space-between;gap:10px">
        <h3>${esc(product.nama)}</h3>

        <span class="stock">
          Stok: ${esc(product.stok)} ${esc(product.satuan)}
        </span>
      </div>

      <p>
        ${esc(product.kategori || 'Barang')}
        ·
        ${esc(product.keterangan || 'Tidak ada keterangan')}
      </p>

      <div class="price">
        ${rupiah(product.harga)} / ${esc(product.satuan || 'unit')}
      </div>
    </article>
  `).join('');
}


/**
 * Mengisi pilihan produk pada form kasir.
 */
function fillProductSelect() {
  const select = $('itemSelect');
  const previousValue = select.value;

  const availableProducts = state.products.filter(
    (product) => Number(product.stok) > 0
  );

  select.innerHTML = `
    <option value="">Pilih barang…</option>
    ${availableProducts.map((product) => `
      <option value="${esc(product.id)}">
        ${esc(product.nama)}
      </option>
    `).join('')}
  `;

  if (
    availableProducts.some(
      (product) => product.id === previousValue
    )
  ) {
    select.value = previousValue;
  }

  updateSelectedProduct();
}


$('itemSelect').onchange = updateSelectedProduct;


/**
 * Menampilkan harga dan stok produk terpilih.
 */
function updateSelectedProduct() {
  const product = state.products.find(
    (item) => item.id === $('itemSelect').value
  );

  $('itemPrice').value = product
    ? rupiah(product.harga) + ' / ' + (product.satuan || 'unit')
    : '';

  $('itemStock').value = product
    ? `${product.stok} ${product.satuan || ''}`
    : '';
}


// ============================================================
// 7. KERANJANG BELANJA
// ============================================================

/**
 * Menambahkan produk ke keranjang.
 */
$('addItem').onclick = () => {
  const product = state.products.find(
    (item) => item.id === $('itemSelect').value
  );

  const qty = Number($('itemQty').value);

  if (!product) {
    alert('Pilih barang terlebih dahulu.');
    return;
  }

  if (!(qty > 0)) {
    alert('Qty harus lebih dari 0.');
    return;
  }

  const quantityInCart = state.cart
    .filter((item) => item.id === product.id)
    .reduce((sum, item) => sum + item.qty, 0);

  if (qty + quantityInCart > Number(product.stok)) {
    alert('Qty melebihi stok yang tersedia.');
    return;
  }

  const existingItem = state.cart.find(
    (item) => item.id === product.id
  );

  if (existingItem) {
    existingItem.qty += qty;

  } else {
    state.cart.push({
      id: product.id,
      nama: product.nama,
      satuan: product.satuan || 'unit',
      harga: Number(product.harga),
      qty
    });
  }

  $('itemQty').value = '1';

  renderCart();
};


/**
 * Menghitung total seluruh keranjang.
 */
const cartTotal = () => {
  return state.cart.reduce(
    (sum, item) => sum + item.qty * item.harga,
    0
  );
};


/**
 * Menampilkan isi keranjang dan total belanja.
 */
function renderCart() {
  const body = $('cartRows');

  if (!state.cart.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="empty">
          Belum ada barang.
        </td>
      </tr>
    `;

  } else {
    body.innerHTML = state.cart.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${esc(item.nama)}</td>
        <td>${item.qty} ${esc(item.satuan)}</td>
        <td>${rupiah(item.harga)}</td>
        <td>${rupiah(item.qty * item.harga)}</td>

        <td>
          <button data-remove="${index}" title="Hapus">
            ×
          </button>
        </td>
      </tr>
    `).join('');
  }

  body.querySelectorAll('[data-remove]').forEach((button) => {
    button.onclick = () => {
      state.cart.splice(Number(button.dataset.remove), 1);
      renderCart();
    };
  });

  $('cartTotal').textContent = rupiah(cartTotal());

  updateChange();
}


// ============================================================
// 8. PEMBAYARAN DAN KEMBALIAN
// ============================================================

$('amountPaid').oninput = updateChange;


/**
 * Menghitung uang kembalian.
 */
function updateChange() {
  const paid = Number($('amountPaid').value || 0);
  const change = Math.max(0, paid - cartTotal());

  $('changeDue').textContent = rupiah(change);
}


// ============================================================
// 9. PROSES CHECKOUT
// ============================================================

$('finishSale').onclick = async () => {
  if (!state.cart.length) {
    alert('Daftar belanja masih kosong.');
    return;
  }

  const total = cartTotal();
  const bayar = Number($('amountPaid').value || 0);

  if (bayar < total) {
    alert('Uang bayar kurang dari total belanja.');
    return;
  }

  const button = $('finishSale');

  button.disabled = true;
  $('saleMessage').textContent = 'Menyimpan transaksi…';

  try {
    const result = await api('checkout', {
      namaPelanggan:
        $('customerName').value.trim() || 'Pelanggan Umum',

      bayar,
      items: state.cart
    });

    state.lastReceipt = result.receipt;

    showReceipt(result.receipt);

    state.cart = [];

    $('amountPaid').value = '';
    $('customerName').value = '';

    renderCart();

    await Promise.all([
      loadProducts(),
      loadCustomers(),
      loadDashboard()
    ]);

    $('saleMessage').textContent =
      'Transaksi berhasil disimpan.';

  } catch (error) {
    $('saleMessage').textContent = error.message;

  } finally {
    button.disabled = false;
  }
};


// ============================================================
// 10. DATA CUSTOMER
// ============================================================

async function loadCustomers() {
  try {
    const result = await api('customers');

    state.customers = result.customers || [];

    $('customerOptions').innerHTML =
      state.customers.map((customer) => `
        <option value="${esc(customer.nama)}">
      `).join('');

  } catch (error) {
    console.warn(error.message);
  }
}


// ============================================================
// 11. STRUK BELANJA
// ============================================================

/**
 * Menampilkan struk transaksi.
 */
function showReceipt(receipt) {
  $('receiptContent').innerHTML = `
    <div class="receipt-title">
      <h2>YONS AGEN</h2>

      <div>Jl. Parungseah RT.04/RW.06, Sukabumi</div>
      <div>HP 089614021972</div>

      <p>STRUK BELANJA</p>
    </div>

    <div class="receipt-line">
      <span>No. transaksi</span>
      <strong>${esc(receipt.id)}</strong>
    </div>

    <div class="receipt-line">
      <span>Tanggal</span>
      <span>${esc(receipt.tanggal)}</span>
    </div>

    <div class="receipt-line">
      <span>Pelanggan</span>
      <span>${esc(receipt.pelanggan)}</span>
    </div>

    <div class="receipt-items">
      ${receipt.items.map((item) => `
        <p>
          ${esc(item.nama)}<br>

          <small>
            ${item.qty} ${esc(item.satuan)}
            × ${rupiah(item.harga)}

            <span style="float:right">
              ${rupiah(item.jumlah)}
            </span>
          </small>
        </p>
      `).join('')}
    </div>

    <div class="receipt-line">
      <strong>Total</strong>
      <strong>${rupiah(receipt.total)}</strong>
    </div>

    <div class="receipt-line">
      <span>Bayar</span>
      <span>${rupiah(receipt.bayar)}</span>
    </div>

    <div class="receipt-line">
      <span>Kembalian</span>
      <span>${rupiah(receipt.kembalian)}</span>
    </div>

    <p style="text-align:center;margin-top:22px">
      Terima kasih telah berbelanja.
    </p>
  `;

  $('receiptModal').classList.remove('hidden');
}


/**
 * Menutup modal struk.
 */
$('closeReceipt').onclick = () => {
  $('receiptModal').classList.add('hidden');
};


$('receiptModal').addEventListener('click', (event) => {
  if (event.target === $('receiptModal')) {
    $('receiptModal').classList.add('hidden');
  }
});


// ============================================================
// 12. CETAK DAN BAGIKAN STRUK
// ============================================================

/**
 * Mengubah struk menjadi teks untuk WhatsApp.
 */
function receiptText(receipt) {
  const items = receipt.items.map((item) => {
    return (
      `${item.nama}\n` +
      `${item.qty} ${item.satuan} x ` +
      `${rupiah(item.harga)} = ${rupiah(item.jumlah)}`
    );
  }).join('\n');

  return (
    '*YONS AGEN — STRUK BELANJA*\n' +
    'Jl. Parungseah RT.04/RW.06, Sukabumi\n' +
    `No: ${receipt.id}\n` +
    `Tanggal: ${receipt.tanggal}\n` +
    `Pelanggan: ${receipt.pelanggan}\n\n` +
    items +
    '\n\n' +
    `*TOTAL: ${rupiah(receipt.total)}*\n` +
    `Bayar: ${rupiah(receipt.bayar)}\n` +
    `Kembalian: ${rupiah(receipt.kembalian)}\n\n` +
    'Terima kasih telah berbelanja.'
  );
}


/**
 * Membagikan struk melalui WhatsApp.
 */
$('shareReceipt').onclick = () => {
  if (!state.lastReceipt) return;

  const url =
    'https://wa.me/?text=' +
    encodeURIComponent(receiptText(state.lastReceipt));

  window.open(url, '_blank', 'noopener');
};


/**
 * Mencetak struk.
 */
$('printReceipt').onclick = () => {
  window.print();
};


// ============================================================
// 13. DASHBOARD
// ============================================================

$('refreshDashboard').onclick = loadDashboard;
$('applyDashboard').onclick = loadDashboard;


/**
 * Mengambil data dashboard dari backend.
 */
async function loadDashboard() {
  try {
    const result = await api('dashboard', {
      period: $('period').value,
      target: Number($('salesTarget').value || 0)
    });

    state.dashboard = result;

    renderDashboard(result);

  } catch (error) {
    $('dailyBars').innerHTML =
      '<p class="muted">' +
      esc(error.message) +
      '</p>';
  }
}


/**
 * Menghitung persentase perubahan.
 */
function pct(current, previous) {
  if (!previous) {
    return current ? '+100%' : '0%';
  }

  const value = ((current - previous) / previous) * 100;

  return (
    (value > 0 ? '+' : '') +
    value.toFixed(1) +
    '%'
  );
}


/**
 * Menampilkan ringkasan dan grafik dashboard.
 */
function renderDashboard(result) {
  const summary = result.summary;
  const previous = result.previous;

  // Ringkasan utama.
  $('metricRevenue').textContent =
    rupiah(summary.revenue);

  $('metricTransactions').textContent =
    summary.transactions;

  $('metricItems').textContent =
    summary.items;

  $('metricAverage').textContent = rupiah(
    summary.transactions
      ? summary.revenue / summary.transactions
      : 0
  );

  // Perbandingan periode sebelumnya.
  $('metricRevenueChange').textContent =
    'vs sebelumnya: ' +
    pct(summary.revenue, previous.revenue);

  $('metricTransactionsChange').textContent =
    'vs sebelumnya: ' +
    pct(summary.transactions, previous.transactions);

  $('metricItemsChange').textContent =
    'vs sebelumnya: ' +
    pct(summary.items, previous.items);

  // Target omzet.
  const target = Number(result.target) || 0;

  const percent = target
    ? Math.round(summary.revenue / target * 100)
    : 0;

  $('targetPercent').textContent = percent + '%';

  $('targetBar').style.width =
    Math.min(100, Math.max(0, percent)) + '%';

  $('actualLabel').textContent =
    'Aktual: ' + rupiah(summary.revenue);

  $('targetLabel').textContent =
    'Target: ' + rupiah(target);

  $('comparisonText').textContent =
    `${pct(summary.revenue, previous.revenue)} ` +
    `dibanding periode sebelumnya ` +
    `(${rupiah(previous.revenue)})`;

  // Grafik omzet.
  renderDailyBars(result.daily || []);
}


/**
 * Menggambar grafik omzet berdasarkan data backend.
 */
function renderDailyBars(bars) {
  const container = $('dailyBars');

  if (!bars.length) {
    container.innerHTML =
      '<p class="muted">Belum ada transaksi.</p>';

    return;
  }

  const maxRevenue = Math.max(
    1,
    ...bars.map((item) => item.revenue)
  );

  container.innerHTML = bars.map((item) => {
    const height = Math.max(
      3,
      Math.round(item.revenue / maxRevenue * 115)
    );

    return `
      <div
        class="bar-col"
        title="${esc(item.label)}: ${rupiah(item.revenue)}"
      >
        <div
          class="bar"
          style="height:${height}px"
        ></div>

        <div>${esc(item.label)}</div>

        <div>
          ${item.revenue ? rupiah(item.revenue) : '—'}
        </div>
      </div>
    `;
  }).join('');
}
