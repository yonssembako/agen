/**
 * Yons Agen Kasir
 * Isi API_URL dengan URL Web App Apps Script setelah deployment.
 */

const API_URL = 'TEMPEL_URL_WEB_APP_APPS_SCRIPT_DI_SINI';

const $ = id => document.getElementById(id);

const state = {
  password: '',
  products: [],
  customers: [],
  suppliers: [],
  cart: [],
  purchaseCart: [],
  lastReceipt: null,
  dashboard: null
};

const rupiah = n =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number(n) || 0);

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);


/* =========================================================
 * 1. KONEKSI API
 * ========================================================= */

function api(action, data = {}) {
  return new Promise((resolve, reject) => {
    if (!API_URL.startsWith('https://script.google.com/')) {
      return reject(
        new Error('URL Apps Script belum diisi di app.js.')
      );
    }

    const callback =
      'yonsCb_' +
      Date.now() +
      '_' +
      Math.floor(Math.random() * 100000);

    const script = document.createElement('script');

    const timer = setTimeout(() => {
      cleanup();

      reject(
        new Error(
          'Koneksi timeout. Periksa URL dan deployment Apps Script.'
        )
      );
    }, 20000);

    function cleanup() {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    }

    window[callback] = result => {
      cleanup();

      if (result && result.ok) {
        resolve(result);
      } else {
        reject(
          new Error(result?.error || 'Permintaan gagal.')
        );
      }
    };

    const params = new URLSearchParams({
      action,
      callback,
      password: state.password,
      payload: JSON.stringify(data)
    });

    script.src = API_URL + '?' + params.toString();

    script.onerror = () => {
      cleanup();
      reject(new Error('Gagal terhubung ke Apps Script.'));
    };

    document.body.appendChild(script);
  });
}


/* =========================================================
 * 2. LOGIN DAN LOGOUT
 * ========================================================= */

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();

  state.password = $('password').value.trim();
  $('loginMessage').textContent = 'Memeriksa password…';

  try {
    await api('login');

    $('loginScreen').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('loginMessage').textContent = '';

    await Promise.all([
      loadProducts(),
      loadCustomers(),
      loadSuppliers(),
      loadDashboard()
    ]);
  } catch (err) {
    state.password = '';
    $('password').value = '';

    $('loginMessage').textContent =
      err.message +
      ' Jika di HP bisa tetapi PC tidak, muat ulang paksa dengan Ctrl+F5 dan pastikan password sama.';
  }
});


$('logoutBtn').onclick = () => {
  state.password = '';
  state.cart = [];

  $('app').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('password').focus();
};


/* =========================================================
 * 3. NAVIGASI TAB
 * ========================================================= */

document.querySelectorAll('.tab').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => {
      x.classList.toggle('active', x === b);
    });

    document.querySelectorAll('.page').forEach(p => {
      p.classList.toggle(
        'hidden',
        p.id !== 'page-' + b.dataset.page
      );
    });

    if (b.dataset.page === 'kasir') {
      renderCart();
    }

    if (b.dataset.page === 'dashboard') {
      loadDashboard();
    }

    if (b.dataset.page === 'pembelian') {
      loadSuppliers();
      fillPurchaseSelect();
      renderPurchaseCart();
    }
  };
});


/* =========================================================
 * 4. DATA PRODUK
 * ========================================================= */

$('refreshProducts').onclick = loadProducts;


async function loadProducts() {
  try {
    const r = await api('products');

    state.products = r.products || [];

    renderProducts();
    fillProductSelect();
  } catch (e) {
    $('productGrid').innerHTML =
      '<p class="muted">' + esc(e.message) + '</p>';
  }
}


function renderProducts() {
  if (!state.products.length) {
    $('productGrid').innerHTML =
      '<p class="muted">Belum ada data produk. Tambahkan produk di sheet Produk.</p>';

    return;
  }

  $('productGrid').innerHTML = state.products.map(p => {
    const name = String(p.nama || '').toLowerCase();

    const fallback = name.includes('telur')
      ? 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=600&q=80'
      : name.includes('minyak')
        ? 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80'
        : name.includes('beras')
          ? 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80'
          : 'https://placehold.co/600x400/eaf4f7/52666d?text=Foto+Produk';

    const photo = p.foto || fallback;

    return `
      <article class="product-card">
        <img
          class="product-photo"
          src="${esc(photo)}"
          alt="Foto ${esc(p.nama)}"
          loading="lazy"
          onerror="this.onerror=null;this.src='https://placehold.co/600x400/eaf4f7/52666d?text=Foto+Produk'"
        >

        <div class="product-info">
          <div class="product-title-row">
            <h3>${esc(p.nama)}</h3>
            <span class="stock">
              Stok: ${esc(p.stok)} ${esc(p.satuan)}
            </span>
          </div>

          <p>
            ${esc(p.kategori || 'Barang')}
            ·
            ${esc(p.keterangan || 'Tidak ada keterangan')}
          </p>

          <div class="price">
            ${rupiah(p.harga)} / ${esc(p.satuan || 'unit')}
          </div>
        </div>
      </article>
    `;
  }).join('');
}


function fillProductSelect() {
  const old = $('itemSelect').value;

  $('itemSelect').innerHTML =
    '<option value="">Pilih barang…</option>' +
    state.products
      .filter(p => Number(p.stok) > 0)
      .map(p => `
        <option value="${esc(p.id)}">
          ${esc(p.nama)}
        </option>
      `)
      .join('');

  if (state.products.some(p => p.id === old)) {
    $('itemSelect').value = old;
  }

  updateSelectedProduct();
}


$('itemSelect').onchange = updateSelectedProduct;


function updateSelectedProduct() {
  const p = state.products.find(
    x => x.id === $('itemSelect').value
  );

  $('itemPrice').value = p
    ? rupiah(p.harga) + ' / ' + (p.satuan || 'unit')
    : '';

  $('itemStock').value = p
    ? `${p.stok} ${p.satuan || ''}`
    : '';
}


/* =========================================================
 * 5. KERANJANG KASIR
 * ========================================================= */

$('addItem').onclick = () => {
  const p = state.products.find(
    x => x.id === $('itemSelect').value
  );

  const qty = Number($('itemQty').value);

  if (!p) {
    return alert('Pilih barang terlebih dahulu.');
  }

  if (!(qty > 0)) {
    return alert('Qty harus lebih dari 0.');
  }

  const inCart = state.cart
    .filter(x => x.id === p.id)
    .reduce((s, x) => s + x.qty, 0);

  if (qty + inCart > Number(p.stok)) {
    return alert('Qty melebihi stok yang tersedia.');
  }

  const existing = state.cart.find(x => x.id === p.id);

  if (existing) {
    existing.qty += qty;
  } else {
    state.cart.push({
      id: p.id,
      nama: p.nama,
      satuan: p.satuan || 'unit',
      harga: Number(p.harga),
      qty
    });
  }

  $('itemQty').value = '1';

  renderCart();
};


function renderCart() {
  const body = $('cartRows');

  if (!state.cart.length) {
    body.innerHTML =
      '<tr><td colspan="6" class="empty">Belum ada barang.</td></tr>';
  } else {
    body.innerHTML = state.cart.map((x, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(x.nama)}</td>
        <td>${x.qty} ${esc(x.satuan)}</td>
        <td>${rupiah(x.harga)}</td>
        <td>${rupiah(x.qty * x.harga)}</td>
        <td>
          <button data-remove="${i}" title="Hapus">×</button>
        </td>
      </tr>
    `).join('');
  }

  body.querySelectorAll('[data-remove]').forEach(b => {
    b.onclick = () => {
      state.cart.splice(Number(b.dataset.remove), 1);
      renderCart();
    };
  });

  $('cartTotal').textContent = rupiah(cartTotal());

  updateChange();
}


const cartTotal = () =>
  state.cart.reduce((s, x) => s + x.qty * x.harga, 0);


$('amountPaid').oninput = updateChange;


function updateChange() {
  $('changeDue').textContent = rupiah(
    Math.max(
      0,
      Number($('amountPaid').value || 0) - cartTotal()
    )
  );
}


/* =========================================================
 * 6. SELESAIKAN TRANSAKSI
 * ========================================================= */

$('finishSale').onclick = async () => {
  if (!state.cart.length) {
    return alert('Daftar belanja masih kosong.');
  }

  const total = cartTotal();
  const bayar = Number($('amountPaid').value || 0);

  if (bayar < total) {
    return alert('Uang bayar kurang dari total belanja.');
  }

  $('finishSale').disabled = true;
  $('saleMessage').textContent = 'Menyimpan transaksi…';

  try {
    const r = await api('checkout', {
      namaPelanggan:
        $('customerName').value.trim() || 'Pelanggan Umum',
      bayar,
      items: state.cart
    });

    state.lastReceipt = r.receipt;

    showReceipt(r.receipt);

    state.cart = [];

    $('amountPaid').value = '';
    $('customerName').value = '';

    renderCart();

    await Promise.all([
      loadProducts(),
      loadCustomers(),
      loadSuppliers(),
      loadDashboard()
    ]);

    $('saleMessage').textContent =
      'Transaksi berhasil disimpan.';
  } catch (e) {
    $('saleMessage').textContent = e.message;
  } finally {
    $('finishSale').disabled = false;
  }
};


/* =========================================================
 * 7. DATA SUPPLIER
 * ========================================================= */

async function loadSuppliers() {
  try {
    const r = await api('suppliers');

    state.suppliers = r.suppliers || [];

    $('supplierOptions').innerHTML = state.suppliers
      .map(x => `<option value="${esc(x.nama)}">`)
      .join('');
  } catch (e) {
    console.warn(e.message);
  }
}


/* =========================================================
 * 8. KERANJANG PEMBELIAN
 * ========================================================= */

function fillPurchaseSelect() {
  const old = $('purchaseItem').value;

  $('purchaseItem').innerHTML =
    '<option value="">Pilih barang…</option>' +
    state.products.map(p => `
      <option value="${esc(p.id)}">
        ${esc(p.nama)}
      </option>
    `).join('');

  if (state.products.some(p => p.id === old)) {
    $('purchaseItem').value = old;
  }
}


$('purchaseItem').onchange = () => {
  const p = state.products.find(
    x => x.id === $('purchaseItem').value
  );

  $('purchasePrice').value = p ? Number(p.harga) : '';
};


$('addPurchaseItem').onclick = () => {
  const p = state.products.find(
    x => x.id === $('purchaseItem').value
  );

  const qty = Number($('purchaseQty').value);
  const hargaBeli = Number($('purchasePrice').value);

  if (!p) {
    return alert('Pilih barang.');
  }

  if (
    !(qty > 0) ||
    !(hargaBeli >= 0) ||
    $('purchasePrice').value === ''
  ) {
    return alert('Isi jumlah dan harga beli dengan benar.');
  }

  const existing = state.purchaseCart.find(
    x => x.id === p.id
  );

  if (existing) {
    existing.qty += qty;
    existing.hargaBeli = hargaBeli;
  } else {
    state.purchaseCart.push({
      id: p.id,
      nama: p.nama,
      satuan: p.satuan || 'unit',
      qty,
      hargaBeli
    });
  }

  $('purchaseQty').value = '1';

  renderPurchaseCart();
};


function renderPurchaseCart() {
  const el = $('purchaseList');

  if (!state.purchaseCart.length) {
    el.innerHTML =
      '<p class="muted">Belum ada barang pembelian.</p>';
  } else {
    el.innerHTML = state.purchaseCart.map((x, i) => `
      <div class="purchase-row">
        <div>
          <strong>${esc(x.nama)}</strong>
          <small>
            ${x.qty} ${esc(x.satuan)} × ${rupiah(x.hargaBeli)}
          </small>
        </div>

        <strong>${rupiah(x.qty * x.hargaBeli)}</strong>

        <button
          type="button"
          data-premove="${i}"
          aria-label="Hapus barang"
        >×</button>
      </div>
    `).join('');
  }

  el.querySelectorAll('[data-premove]').forEach(b => {
    b.onclick = () => {
      state.purchaseCart.splice(Number(b.dataset.premove), 1);
      renderPurchaseCart();
    };
  });

  $('purchaseTotal').textContent = rupiah(
    state.purchaseCart.reduce(
      (s, x) => s + x.qty * x.hargaBeli,
      0
    )
  );
}


/* =========================================================
 * 9. SIMPAN PEMBELIAN
 * ========================================================= */

$('savePurchase').onclick = async () => {
  if (!state.purchaseCart.length) {
    return alert('Tambahkan barang pembelian terlebih dahulu.');
  }

  if (!$('supplierName').value.trim()) {
    return alert('Isi nama pemasok.');
  }

  const btn = $('savePurchase');

  btn.disabled = true;
  $('purchaseMessage').textContent = 'Menyimpan pembelian…';

  try {
    const r = await api('purchase', {
      namaSupplier: $('supplierName').value.trim(),
      metodeBayar: $('purchaseMethod').value,
      catatan: $('purchaseNote').value.trim(),
      items: state.purchaseCart
    });

    state.purchaseCart = [];

    renderPurchaseCart();

    $('purchaseNote').value = '';

    $('purchaseMessage').textContent =
      `Pembelian ${r.purchase.id} tersimpan. ` +
      `Total ${rupiah(r.purchase.total)}. Stok sudah diperbarui.`;

    await Promise.all([
      loadProducts(),
      loadSuppliers(),
      loadDashboard()
    ]);
  } catch (e) {
    $('purchaseMessage').textContent = e.message;
  } finally {
    btn.disabled = false;
  }
};


/* =========================================================
 * 10. DATA PELANGGAN
 * ========================================================= */

async function loadCustomers() {
  try {
    const r = await api('customers');

    state.customers = r.customers || [];

    $('customerOptions').innerHTML = state.customers
      .map(c => `<option value="${esc(c.nama)}">`)
      .join('');
  } catch (e) {
    console.warn(e.message);
  }
}


$('addCustomerBtn').onclick = () => {
  $('customerForm').classList.toggle('hidden');
  $('customerMessage').textContent = '';

  if (!$('customerForm').classList.contains('hidden')) {
    $('newCustomerName').focus();
  }
};


$('cancelCustomerBtn').onclick = () => {
  $('customerForm').classList.add('hidden');

  $('newCustomerName').value = '';
  $('newCustomerWa').value = '';
  $('newCustomerAddress').value = '';
  $('customerMessage').textContent = '';
};


$('saveCustomerBtn').onclick = async () => {
  const nama = $('newCustomerName').value.trim();

  if (!nama) {
    $('customerMessage').textContent =
      'Nama pelanggan wajib diisi.';
    return;
  }

  const btn = $('saveCustomerBtn');

  btn.disabled = true;
  $('customerMessage').textContent =
    'Menyimpan data pelanggan…';

  try {
    const r = await api('addCustomer', {
      nama,
      wa: $('newCustomerWa').value.trim(),
      alamat: $('newCustomerAddress').value.trim()
    });

    await loadCustomers();

    $('customerName').value = r.customer.nama;
    $('customerForm').classList.add('hidden');

    $('newCustomerName').value = '';
    $('newCustomerWa').value = '';
    $('newCustomerAddress').value = '';

    $('customerMessage').textContent =
      'Pelanggan berhasil disimpan.';
  } catch (e) {
    $('customerMessage').textContent = e.message;
  } finally {
    btn.disabled = false;
  }
};


/* =========================================================
 * 11. STRUK TRANSAKSI
 * ========================================================= */

function showReceipt(r) {
  $('receiptContent').innerHTML = `
    <div class="receipt-title">
      <h2>YONS AGEN</h2>
      <div>Jl. Parungseah RT.04/RW.06, Sukabumi</div>
      <div>HP 089614021972</div>
      <p>STRUK BELANJA</p>
    </div>

    <div class="receipt-line">
      <span>No. transaksi</span>
      <strong>${esc(r.id)}</strong>
    </div>

    <div class="receipt-line">
      <span>Tanggal</span>
      <span>${esc(r.tanggal)}</span>
    </div>

    <div class="receipt-line">
      <span>Pelanggan</span>
      <span>${esc(r.pelanggan)}</span>
    </div>

    <div class="receipt-items">
      ${r.items.map(x => `
        <p>
          ${esc(x.nama)}<br>
          <small>
            ${x.qty} ${esc(x.satuan)} × ${rupiah(x.harga)}
            <span style="float:right">
              ${rupiah(x.jumlah)}
            </span>
          </small>
        </p>
      `).join('')}
    </div>

    <div class="receipt-line">
      <strong>Total</strong>
      <strong>${rupiah(r.total)}</strong>
    </div>

    <div class="receipt-line">
      <span>Bayar</span>
      <span>${rupiah(r.bayar)}</span>
    </div>

    <div class="receipt-line">
      <span>Kembalian</span>
      <span>${rupiah(r.kembalian)}</span>
    </div>

    <p style="text-align:center;margin-top:22px">
      Terima kasih telah berbelanja.
    </p>
  `;

  $('receiptModal').classList.remove('hidden');
}


$('closeReceipt').onclick = () => {
  $('receiptModal').classList.add('hidden');
};


$('receiptModal').addEventListener('click', e => {
  if (e.target === $('receiptModal')) {
    $('receiptModal').classList.add('hidden');
  }
});


function receiptText(r) {
  return (
    '*YONS AGEN — STRUK BELANJA*\n' +
    'Jl. Parungseah RT.04/RW.06, Sukabumi\n' +
    `No: ${r.id}\n` +
    `Tanggal: ${r.tanggal}\n` +
    `Pelanggan: ${r.pelanggan}\n\n` +
    r.items.map(x =>
      `${x.nama}\n` +
      `${x.qty} ${x.satuan} x ${rupiah(x.harga)} = ${rupiah(x.jumlah)}`
    ).join('\n') +
    '\n\n' +
    `*TOTAL: ${rupiah(r.total)}*\n` +
    `Bayar: ${rupiah(r.bayar)}\n` +
    `Kembalian: ${rupiah(r.kembalian)}\n\n` +
    'Terima kasih telah berbelanja.'
  );
}


$('shareReceipt').onclick = () => {
  if (state.lastReceipt) {
    window.open(
      'https://wa.me/?text=' +
        encodeURIComponent(receiptText(state.lastReceipt)),
      '_blank',
      'noopener'
    );
  }
};


$('printReceipt').onclick = () => window.print();


/* =========================================================
 * 12. DASHBOARD
 * ========================================================= */

$('refreshDashboard').onclick = loadDashboard;
$('applyDashboard').onclick = loadDashboard;


async function loadDashboard() {
  try {
    const r = await api('dashboard', {
      period: $('period').value,
      target: Number($('salesTarget').value || 0)
    });

    state.dashboard = r;

    renderDashboard(r);
  } catch (e) {
    $('dailyBars').innerHTML =
      '<p class="muted">' + esc(e.message) + '</p>';
  }
}


function pct(curr, prev) {
  if (!prev) {
    return curr ? '+100%' : '0%';
  }

  const v = ((curr - prev) / prev) * 100;

  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}


function renderDashboard(r) {
  const s = r.summary;

  $('metricRevenue').textContent = rupiah(s.revenue);
  $('metricTransactions').textContent = s.transactions;
  $('metricItems').textContent = s.items;

  $('metricAverage').textContent = rupiah(
    s.transactions ? s.revenue / s.transactions : 0
  );

  $('metricRevenueChange').textContent =
    'vs sebelumnya: ' + pct(s.revenue, r.previous.revenue);

  $('metricTransactionsChange').textContent =
    'vs sebelumnya: ' +
    pct(s.transactions, r.previous.transactions);

  $('metricItemsChange').textContent =
    'vs sebelumnya: ' + pct(s.items, r.previous.items);

  const target = Number(r.target) || 0;
  const percent = target
    ? Math.round((s.revenue / target) * 100)
    : 0;

  $('targetPercent').textContent = percent + '%';

  $('targetBar').style.width =
    Math.min(100, Math.max(0, percent)) + '%';

  $('actualLabel').textContent =
    'Aktual: ' + rupiah(s.revenue);

  $('targetLabel').textContent =
    'Target: ' + rupiah(target);

  $('comparisonText').textContent =
    `${pct(s.revenue, r.previous.revenue)} dibanding periode sebelumnya (${rupiah(r.previous.revenue)})`;

  const bars = r.daily || [];
  const max = Math.max(1, ...bars.map(x => x.revenue));

  $('dailyBars').innerHTML = bars.length
    ? bars.map(x => `
        <div
          class="bar-col"
          title="${esc(x.label)}: ${rupiah(x.revenue)}"
        >
          <div
            class="bar"
            style="height:${Math.max(3, Math.round(x.revenue / max * 115))}px"
          ></div>

          <div>${esc(x.label)}</div>

          <div>${x.revenue ? rupiah(x.revenue) : '—'}</div>
        </div>
      `).join('')
    : '<p class="muted">Belum ada transaksi.</p>';
}
