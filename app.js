
/* =========================================================
   YONS AGEN KASIR
   Isi API_URL dengan URL Web App Apps Script setelah deployment.
   ========================================================= */

const API_URL = 'https://script.google.com/macros/s/AKfycbx6zokzVyHxnKT4ybaV7HdeZWnZcxVHGnmeHmo2yx9C9wsyMg3ANZzYECzpJ9sBl-6F4w/exec';

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

/* =========================================================
   UTILITAS
   ========================================================= */

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
   KONEKSI API GOOGLE APPS SCRIPT
   ========================================================= */

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

      reject(
        new Error('Gagal terhubung ke Apps Script.')
      );
    };

    document.body.appendChild(script);
  });
}

/* =========================================================
   LOGIN DAN LOGOUT
   ========================================================= */

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();

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
      loadSuppliers(),
      loadDashboard()
    ]);
  } catch (err) {
    state.password = '';
    $('password').value = '';
    $('loginMessage').textContent = err.message;
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
   NAVIGASI TAB
   ========================================================= */

document.querySelectorAll('.tab').forEach(button => {
  button.onclick = () => {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab === button);
    });

    document.querySelectorAll('.page').forEach(page => {
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

    if (button.dataset.page === 'pembelian') {
      loadSuppliers();
      fillPurchaseSelect();
      renderPurchaseCart();
    }
  };
});

/* =========================================================
   PRODUK
   ========================================================= */

$('refreshProducts').onclick = loadProducts;

async function loadProducts() {
  try {
    const result = await api('products');

    state.products = result.products || [];

    renderProducts();
    fillProductSelect();
  } catch (err) {
    $('productGrid').innerHTML =
      '<p class="muted">' + esc(err.message) + '</p>';
  }
}

function renderProducts() {
  if (!state.products.length) {
    $('productGrid').innerHTML =
      '<p class="muted">' +
      'Belum ada data produk. Tambahkan produk di sheet Produk.' +
      '</p>';

    return;
  }

  $('productGrid').innerHTML = state.products.map(product => {
    const name = String(product.nama || '').toLowerCase();

    let fallback =
      'https://placehold.co/600x400/eaf4f7/52666d?text=Foto+Produk';

    if (name.includes('telur')) {
      fallback =
        'https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=600&q=80';
    } else if (name.includes('minyak')) {
      fallback =
        'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80';
    } else if (name.includes('beras')) {
      fallback =
        'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80';
    }

    const photo = product.foto || fallback;

    return `
      <article class="product-card">
        <img
          class="product-photo"
          src="${esc(photo)}"
          alt="Foto ${esc(product.nama)}"
          loading="lazy"
          onerror="this.onerror=null;this.src='https://placehold.co/600x400/eaf4f7/52666d?text=Foto+Produk'"
        >

        <div class="product-info">
          <div class="product-title-row">
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
      .filter(product => Number(product.stok) > 0)
      .map(product => `
        <option value="${esc(product.id)}">
          ${esc(product.nama)}
        </option>
      `)
      .join('');

  if (state.products.some(product => product.id === old)) {
    $('itemSelect').value = old;
  }

  updateSelectedProduct();
}

$('itemSelect').onchange = updateSelectedProduct;

function updateSelectedProduct() {
  const product = state.products.find(
    item => item.id === $('itemSelect').value
  );

  $('itemPrice').value = product
    ? rupiah(product.harga) + ' / ' + (product.satuan || 'unit')
    : '';

  $('itemStock').value = product
    ? `${product.stok} ${product.satuan || ''}`
    : '';
}

/* =========================================================
   KERANJANG KASIR
   ========================================================= */

$('addItem').onclick = () => {
  const product = state.products.find(
    item => item.id === $('itemSelect').value
  );

  const qty = Number($('itemQty').value);

  if (!product) {
    return alert('Pilih barang terlebih dahulu.');
  }

  if (!(qty > 0)) {
    return alert('Qty harus lebih dari 0.');
  }

  const inCart = state.cart
    .filter(item => item.id === product.id)
    .reduce((sum, item) => sum + item.qty, 0);

  if (qty + inCart > Number(product.stok)) {
    return alert('Qty melebihi stok yang tersedia.');
  }

  const existing = state.cart.find(
    item => item.id === product.id
  );

  if (existing) {
    existing.qty += qty;
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
          <button data-remove="${index}" title="Hapus">×</button>
        </td>
      </tr>
    `).join('');
  }

  body.querySelectorAll('[data-remove]').forEach(button => {
    button.onclick = () => {
      state.cart.splice(Number(button.dataset.remove), 1);
      renderCart();
    };
  });

  $('cartTotal').textContent = rupiah(cartTotal());

  updateChange();
}

const cartTotal = () =>
  state.cart.reduce(
    (sum, item) => sum + item.qty * item.harga,
    0
  );

$('amountPaid').oninput = updateChange;

function updateChange() {
  const paid = Number($('amountPaid').value || 0);

  $('changeDue').textContent = rupiah(
    Math.max(0, paid - cartTotal())
  );
}

/* =========================================================
   PROSES TRANSAKSI PENJUALAN
   ========================================================= */

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
      loadSuppliers(),
      loadDashboard()
    ]);

    $('saleMessage').textContent =
      'Transaksi berhasil disimpan.';
  } catch (err) {
    $('saleMessage').textContent = err.message;
  } finally {
    $('finishSale').disabled = false;
  }
};

/* =========================================================
   PEMASOK
   ========================================================= */

async function loadSuppliers() {
  try {
    const result = await api('suppliers');

    state.suppliers = result.suppliers || [];

    $('supplierOptions').innerHTML =
      state.suppliers.map(supplier => `
        <option value="${esc(supplier.nama)}">
      `).join('');
  } catch (err) {
    console.warn(err.message);
  }
}

/* =========================================================
   KERANJANG PEMBELIAN
   ========================================================= */

function fillPurchaseSelect() {
  const old = $('purchaseItem').value;

  $('purchaseItem').innerHTML =
    '<option value="">Pilih barang…</option>' +
    state.products.map(product => `
      <option value="${esc(product.id)}">
        ${esc(product.nama)}
      </option>
    `).join('');

  if (state.products.some(product => product.id === old)) {
    $('purchaseItem').value = old;
  }
}

$('purchaseItem').onchange = () => {
  const product = state.products.find(
    item => item.id === $('purchaseItem').value
  );

  $('purchasePrice').value = product
    ? Number(product.harga)
    : '';
};

$('addPurchaseItem').onclick = () => {
  const product = state.products.find(
    item => item.id === $('purchaseItem').value
  );

  const qty = Number($('purchaseQty').value);
  const hargaBeli = Number($('purchasePrice').value);

  if (!product) {
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
    item => item.id === product.id
  );

  if (existing) {
    existing.qty += qty;
    existing.hargaBeli = hargaBeli;
  } else {
    state.purchaseCart.push({
      id: product.id,
      nama: product.nama,
      satuan: product.satuan || 'unit',
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
    el.innerHTML = state.purchaseCart.map((item, index) => `
      <div class="purchase-row">
        <div>
          <strong>${esc(item.nama)}</strong>
          <small>
            ${item.qty} ${esc(item.satuan)}
            × ${rupiah(item.hargaBeli)}
          </small>
        </div>

        <strong>${rupiah(item.qty * item.hargaBeli)}</strong>

        <button
          type="button"
          data-premove="${index}"
          aria-label="Hapus barang"
        >
          ×
        </button>
      </div>
    `).join('');
  }

  el.querySelectorAll('[data-premove]').forEach(button => {
    button.onclick = () => {
      state.purchaseCart.splice(
        Number(button.dataset.premove),
        1
      );

      renderPurchaseCart();
    };
  });

  const total = state.purchaseCart.reduce(
    (sum, item) => sum + item.qty * item.hargaBeli,
    0
  );

  $('purchaseTotal').textContent = rupiah(total);
}

/* =========================================================
   SIMPAN PEMBELIAN
   ========================================================= */

$('savePurchase').onclick = async () => {
  if (!state.purchaseCart.length) {
    return alert(
      'Tambahkan barang pembelian terlebih dahulu.'
    );
  }

  const namaSupplier = $('supplierName').value.trim();

  if (!namaSupplier) {
    return alert('Isi nama pemasok.');
  }

  const button = $('savePurchase');

  button.disabled = true;
  $('purchaseMessage').textContent = 'Menyimpan pembelian…';

  try {
    const result = await api('purchase', {
      namaSupplier,
      metodeBayar: $('purchaseMethod').value,
      catatan: $('purchaseNote').value.trim(),
      items: state.purchaseCart
    });

    state.purchaseCart = [];

    renderPurchaseCart();

    $('purchaseNote').value = '';

    $('purchaseMessage').textContent =
      `Pembelian ${result.purchase.id} tersimpan. ` +
      `Total ${rupiah(result.purchase.total)}. ` +
      'Stok sudah diperbarui.';

    await Promise.all([
      loadProducts(),
      loadSuppliers(),
      loadDashboard()
    ]);
  } catch (err) {
    $('purchaseMessage').textContent = err.message;
  } finally {
    button.disabled = false;
  }
};

/* =========================================================
   PELANGGAN
   ========================================================= */

async function loadCustomers() {
  try {
    const result = await api('customers');

    state.customers = result.customers || [];

    $('customerOptions').innerHTML =
      state.customers.map(customer => `
        <option value="${esc(customer.nama)}">
      `).join('');
  } catch (err) {
    console.warn(err.message);
  }
}

/* =========================================================
   STRUK BELANJA
   ========================================================= */

function showReceipt(receipt) {
  const itemsHtml = receipt.items.map(item => `
    <p>
      ${esc(item.nama)}
      <br>

      <small>
        ${item.qty} ${esc(item.satuan)}
        × ${rupiah(item.harga)}

        <span style="float: right">
          ${rupiah(item.jumlah)}
        </span>
      </small>
    </p>
  `).join('');

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
      ${itemsHtml}
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

    <p style="text-align: center; margin-top: 22px">
      Terima kasih telah berbelanja.
    </p>
  `;

  $('receiptModal').classList.remove('hidden');
}

$('closeReceipt').onclick = () => {
  $('receiptModal').classList.add('hidden');
};

$('receiptModal').addEventListener('click', event => {
  if (event.target === $('receiptModal')) {
    $('receiptModal').classList.add('hidden');
  }
});

/* =========================================================
   BAGIKAN STRUK MELALUI WHATSAPP
   ========================================================= */

function receiptText(receipt) {
  const itemsText = receipt.items.map(item => `
${item.nama}
${item.qty} ${item.satuan} x ${rupiah(item.harga)} = ${rupiah(item.jumlah)}
  `.trim()).join('\n');

  return `*YONS AGEN — STRUK BELANJA*
Jl. Parungseah RT.04/RW.06, Sukabumi
No: ${receipt.id}
Tanggal: ${receipt.tanggal}
Pelanggan: ${receipt.pelanggan}

${itemsText}

*TOTAL: ${rupiah(receipt.total)}*
Bayar: ${rupiah(receipt.bayar)}
Kembalian: ${rupiah(receipt.kembalian)}

Terima kasih telah berbelanja.`;
}

$('shareReceipt').onclick = () => {
  if (!state.lastReceipt) return;

  const text = encodeURIComponent(
    receiptText(state.lastReceipt)
  );

  window.open(
    'https://wa.me/?text=' + text,
    '_blank',
    'noopener'
  );
};

$('printReceipt').onclick = () => window.print();

/* =========================================================
   DASHBOARD
   ========================================================= */

$('refreshDashboard').onclick = loadDashboard;
$('applyDashboard').onclick = loadDashboard;

async function loadDashboard() {
  try {
    const result = await api('dashboard', {
      period: $('period').value,
      target: Number($('salesTarget').value || 0)
    });

    state.dashboard = result;

    renderDashboard(result);
  } catch (err) {
    $('dailyBars').innerHTML =
      '<p class="muted">' + esc(err.message) + '</p>';
  }
}

/* =========================================================
   PERBANDINGAN PERSENTASE
   ========================================================= */

function pct(curr, prev) {
  if (!prev) {
    return curr ? '+100%' : '0%';
  }

  const value = ((curr - prev) / prev) * 100;

  return (value > 0 ? '+' : '') + value.toFixed(1) + '%';
}

/* =========================================================
   TAMPILKAN DATA DASHBOARD
   ========================================================= */

function renderDashboard(result) {
  const summary = result.summary;
  const previous = result.previous;

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

  $('metricRevenueChange').textContent =
    'vs sebelumnya: ' +
    pct(summary.revenue, previous.revenue);

  $('metricTransactionsChange').textContent =
    'vs sebelumnya: ' +
    pct(summary.transactions, previous.transactions);

  $('metricItemsChange').textContent =
    'vs sebelumnya: ' +
    pct(summary.items, previous.items);

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

  const bars = result.daily || [];

  const max = Math.max(
    1,
    ...bars.map(item => item.revenue)
  );

  if (bars.length) {
    $('dailyBars').innerHTML = bars.map(item => `
      <div
        class="bar-col"
        title="${esc(item.label)}: ${rupiah(item.revenue)}"
      >
        <div
          class="bar"
          style="height: ${Math.max(
            3,
            Math.round(item.revenue / max * 115)
          )}px"
        ></div>

        <div>${esc(item.label)}</div>

        <div>
          ${item.revenue ? rupiah(item.revenue) : '—'}
        </div>
      </div>
    `).join('');
  } else {
    $('dailyBars').innerHTML =
      '<p class="muted">Belum ada transaksi.</p>';
  }
}
