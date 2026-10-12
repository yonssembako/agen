/** 
 * Yons Agen Kasir — Frontend Script. 
 * Isi API_URL dengan URL Web App Apps Script setelah deployment. 
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbzc96-DGT0h43GKrnKzYBCSvXk8CcRsGXLpHHNVz6WjLcC1NICx6SS5UgKtfmZNZ0P9mw/exec';

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

const rupiah = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function api(action, data = {}) {
  return new Promise((resolve, reject) => {
    if (!API_URL.startsWith('https://script.google.com/')) {
      return reject(new Error('URL Apps Script belum diisi di app.js.'));
    }
    
    const callback = 'yonsCb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    const script = document.createElement('script');
    
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Koneksi timeout. Periksa URL dan deployment Apps Script.'));
    }, 20000);
    
    function cleanup() {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    }
    
    window[callback] = result => {
      cleanup();
      if (result && result.ok) resolve(result);
      else reject(new Error(result?.error || 'Permintaan gagal.'));
    };
    
    const params = new URLSearchParams({ action, callback, password: state.password, payload: JSON.stringify(data) });
    script.src = API_URL + '?' + params.toString();
    script.onerror = () => {
      cleanup();
      reject(new Error('Gagal terhubung ke Apps Script.'));
    };
    
    document.body.appendChild(script);
  });
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  // Jangan mengubah password yang dimasukkan; cocokkan persis dengan Script Properties.
  state.password = $('password').value;
  const message = $('loginMessage');
  const submitButton = $('loginForm').querySelector('button[type="submit"]');
  submitButton.disabled = true;
  message.textContent = 'Memeriksa password…';

  try {
    await api('login');
    $('loginScreen').classList.add('hidden');
    $('app').classList.remove('hidden');
    message.textContent = '';

    // Kesalahan saat memuat data setelah login tidak membatalkan autentikasi.
    await Promise.allSettled([
      loadProducts(),
      loadCustomers(),
      loadSuppliers(),
      loadDashboard()
    ]);
  } catch (err) {
    state.password = '';
    $('password').value = '';
    message.textContent = (err && err.message ? err.message : String(err)) +
      ' Periksa KASIR_PASSWORD di Apps Script > Project Settings > Script properties, dan pastikan Web App sudah di-deploy ke versi terbaru.';
  } finally {
    submitButton.disabled = false;
  }
});
$('logoutBtn').onclick = () => {
  state.password = '';
  state.cart = [];
  $('app').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');$('password').focus();
};

document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('hidden', p.id !== 'page-' + b.dataset.page));
  
  if (b.dataset.page === 'kasir') renderCart();
  if (b.dataset.page === 'dashboard') loadDashboard();
  if (b.dataset.page === 'pembelian') {
    loadSuppliers();
    fillPurchaseSelect();
    renderPurchaseCart();
  }
});

$('refreshProducts').onclick = loadProducts;

async function loadProducts() {
  try {
    const r = await api('products');
    state.products = r.products || [];
    renderProducts();
    fillProductSelect();
  } catch (e) {
    $('productGrid').innerHTML = '<p class="muted">' + esc(e.message) + '</p>';
  }
}

function renderProducts() {
  if (!state.products.length) {
    $('productGrid').innerHTML = '<p class="muted">Belum ada data produk. Tambahkan produk di sheet Produk.</p>';
    return;
  }
  
  $('productGrid').innerHTML = state.products.map(p => {
    const name = String(p.nama || '').toLowerCase();
    const fallback = name.includes('telur') ? 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=600&q=80' : (name.includes('minyak') ? 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80' : (name.includes('beras') ? 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80' : 'https://placehold.co/600x400/eaf4f7/52666d?text=Foto+Produk'));
    const photo = p.foto || fallback;
    
    return `<article class="product-card"><img class="product-photo" src="${esc(photo)}" alt="Foto ${esc(p.nama)}" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/600x400/eaf4f7/52666d?text=Foto+Produk'"><div class="product-info"><div class="product-title-row"><h3>${esc(p.nama)}</h3><span class="stock">Stok: ${esc(p.stok)} ${esc(p.satuan)}</span></div><p>${esc(p.kategori || 'Barang')} · ${esc(p.keterangan || 'Tidak ada keterangan')}</p><div class="price">${rupiah(p.harga)} / ${esc(p.satuan || 'unit')}</div></div></article>`;
  }).join('');
}

function fillProductSelect() {
  const old = $('itemSelect').value;
  $('itemSelect').innerHTML = '<option value="">Pilih barang…</option>' + state.products.filter(p => Number(p.stok) > 0).map(p => `<option value="${esc(p.id)}">${esc(p.nama)}</option>`).join('');
  
  if (state.products.some(p => p.id === old)) $('itemSelect').value = old;
  updateSelectedProduct();
}

$('itemSelect').onchange = () => {
  updateSelectedProduct();
  if ($('itemSelect').value)$('itemQty').focus();
};

function updateSelectedProduct() {
  const p = state.products.find(x => x.id === $('itemSelect').value);$('itemPrice').value = p ? rupiah(p.harga) + ' / ' + (p.satuan || 'unit') : '';
  $('itemStock').value = p ? `${p.stok} ${p.satuan || ''}` : '';
}

$('addItem').onclick = () => {
  const p = state.products.find(x => x.id === $('itemSelect').value);
  const qty = Number($('itemQty').value);
  
  if (!p) return alert('Pilih barang terlebih dahulu.');
  if (!(qty > 0)) return alert('Qty harus lebih dari 0.');
  
  const inCart = state.cart.filter(x => x.id === p.id).reduce((s, x) => s + x.qty, 0);
  if (qty + inCart > Number(p.stok)) return alert('Qty melebihi stok yang tersedia.');
  
  const existing = state.cart.find(x => x.id === p.id);
  if (existing) {
    existing.qty += qty;
  } else {
    state.cart.push({ id: p.id, nama: p.nama, satuan: p.satuan || 'unit', harga: Number(p.harga), qty });
  }
  
  $('itemQty').value = '0';
  renderCart();
};

function renderCart() {
  const body = $('cartRows');
  if (!state.cart.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">Belum ada barang.</td></tr>';
  } else {
    body.innerHTML = state.cart.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.nama)}</td><td>${x.qty} ${esc(x.satuan)}</td><td>${rupiah(x.harga)}</td><td>${rupiah(x.qty * x.harga)}</td><td><button data-remove="${i}" title="Hapus">×</button></td></tr>`).join('');
  }
  
  body.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
    state.cart.splice(Number(b.dataset.remove), 1);
    renderCart();
  });
  
  $('cartTotal').textContent = rupiah(cartTotal());
  updateChange();
}

const cartTotal = () => state.cart.reduce((s, x) => s + x.qty * x.harga, 0);

$('amountPaid').oninput = updateChange;

function updateChange() {
  $('changeDue').textContent = rupiah(Math.max(0, Number($('amountPaid').value || 0) - cartTotal()));
}

$('finishSale').onclick = async () => {
  if (!state.cart.length) return alert('Daftar belanja masih kosong.');
  
  const total = cartTotal();
  const bayar = Number($('amountPaid').value || 0);
  if (bayar < total) return alert('Uang bayar kurang dari total belanja.');
  
  $('finishSale').disabled = true;
  $('saleMessage').textContent = 'Menyimpan transaksi…';
  
  try {
    const r = await api('checkout', {
      namaPelanggan: $('customerName').value.trim() || 'Pelanggan Umum',
      bayar,
      items: state.cart
    });
    
    state.lastReceipt = r.receipt;
    showReceipt(r.receipt);
    
    state.cart = [];
    $('amountPaid').value = '';$('customerName').value = '';
    renderCart();
    
    await Promise.all([loadProducts(), loadCustomers(), loadSuppliers(), loadDashboard()]);
    $('saleMessage').textContent = 'Transaksi berhasil disimpan.';
  } catch (e) {
    $('saleMessage').textContent = e.message;
  } finally {
    $('finishSale').disabled = false;
  }
};

async function loadSuppliers() {
  try {
    const r = await api('suppliers');
    state.suppliers = r.suppliers || [];
    $('supplierOptions').innerHTML = state.suppliers.map(x => `<option value="${esc(x.nama)}">`).join('');
  } catch (e) {
    console.warn(e.message);
  }
}

function fillPurchaseSelect() {
  const old = $('purchaseItem').value;
  $('purchaseItem').innerHTML = '<option value="">Pilih barang…</option>' + state.products.map(p => `<option value="${esc(p.id)}">${esc(p.nama)}</option>`).join('');
  if (state.products.some(p => p.id === old)) $('purchaseItem').value = old;
}

$('purchaseItem').onchange = () => {
  const p = state.products.find(x => x.id === $('purchaseItem').value);$('purchasePrice').value = p ? Number(p.harga) : '';
};

$('addPurchaseItem').onclick = () => {
  const p = state.products.find(x => x.id === $('purchaseItem').value);
  const qty = Number($('purchaseQty').value);
  const hargaBeli = Number($('purchasePrice').value);
  
  if (!p) return alert('Pilih barang.');
  if (!(qty > 0) || !(hargaBeli >= 0) || $('purchasePrice').value === '') return alert('Isi jumlah dan harga beli dengan benar.');
  
  const existing = state.purchaseCart.find(x => x.id === p.id);
  if (existing) {
    existing.qty += qty;
    existing.hargaBeli = hargaBeli;
  } else {
    state.purchaseCart.push({ id: p.id, nama: p.nama, satuan: p.satuan || 'unit', qty, hargaBeli });
  }
  
  $('purchaseQty').value = '1';
  renderPurchaseCart();
};

function renderPurchaseCart() {
  const el = $('purchaseList');
  if (!state.purchaseCart.length) {
    el.innerHTML = '<p class="muted">Belum ada barang pembelian.</p>';
  } else {
    el.innerHTML = state.purchaseCart.map((x, i) => `<div class="purchase-row"><div><strong>${esc(x.nama)}</strong><small>${x.qty} ${esc(x.satuan)} × ${rupiah(x.hargaBeli)}</small></div><strong>${rupiah(x.qty * x.hargaBeli)}</strong><button type="button" data-premove="${i}" aria-label="Hapus barang">×</button></div>`).join('');
  }
  
  el.querySelectorAll('[data-premove]').forEach(b => b.onclick = () => {
    state.purchaseCart.splice(Number(b.dataset.premove), 1);
    renderPurchaseCart();
  });
  
  $('purchaseTotal').textContent = rupiah(state.purchaseCart.reduce((s, x) => s + x.qty * x.hargaBeli, 0));
}

$('savePurchase').onclick = async () => {
  if (!state.purchaseCart.length) return alert('Tambahkan barang pembelian terlebih dahulu.');
  if (!$('supplierName').value.trim()) return alert('Isi nama pemasok.');
  
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
    $('purchaseNote').value = '';$('purchaseMessage').textContent = `Pembelian ${r.purchase.id} tersimpan. Total ${rupiah(r.purchase.total)}. Stok sudah diperbarui.`;
    
    await Promise.all([loadProducts(), loadSuppliers(), loadDashboard()]);
  } catch (e) {
    $('purchaseMessage').textContent = e.message;
  } finally {
    btn.disabled = false;
  }
};

async function loadCustomers() {
  try {
    const r = await api('customers');
    state.customers = r.customers || [];
    $('customerOptions').innerHTML = state.customers.map(c => `<option value="${esc(c.nama)}">`).join('');
  } catch (e) {
    console.warn(e.message);
  }
}

$('addCustomerBtn').onclick = () => {
  $('customerForm').classList.toggle('hidden');$('customerMessage').textContent = '';
  if (!$('customerForm').classList.contains('hidden'))$('newCustomerName').focus();
};

$('cancelCustomerBtn').onclick = () => {$('customerForm').classList.add('hidden');
  $('newCustomerName').value = '';$('newCustomerWa').value = '';
  $('newCustomerAddress').value = '';$('customerMessage').textContent = '';
};

$('saveCustomerBtn').onclick = async () => {
  const nama = $('newCustomerName').value.trim();
  if (!nama) {
    $('customerMessage').textContent = 'Nama pelanggan wajib diisi.';
    return;
  }
  
  const btn = $('saveCustomerBtn');
  btn.disabled = true;
  $('customerMessage').textContent = 'Menyimpan data pelanggan…';
  
  try {
    const r = await api('addCustomer', {
      nama,
      wa: $('newCustomerWa').value.trim(),
      alamat: $('newCustomerAddress').value.trim()
    });
    
    await loadCustomers();
    $('customerName').value = r.customer.nama;
    $('customerForm').classList.add('hidden');
    $('newCustomerName').value = '';$('newCustomerWa').value = '';
    $('newCustomerAddress').value = '';$('customerMessage').textContent = 'Pelanggan berhasil disimpan.';
  } catch (e) {
    $('customerMessage').textContent = e.message;
  } finally {
    btn.disabled = false;
  }
};

function showReceipt(r) {
  $('receiptContent').innerHTML = `
    <div class="receipt-title">
      <h2>YONS AGEN</h2>
      <div>Jl. Parungseah RT.04/RW.06, Sukabumi</div>
      <div>HP 089614021972</div>
      <p>STRUK BELANJA</p>
    </div>
    <div class="receipt-line"><span>No. transaksi</span><strong>${esc(r.id)}</strong></div>
    <div class="receipt-line"><span>Tanggal</span><span>${esc(r.tanggal)}</span></div>
    <div class="receipt-line"><span>Pelanggan</span><span>${esc(r.pelanggan)}</span></div>
    <div class="receipt-items">${r.items.map(x => `<p>${esc(x.nama)}<br><small>${x.qty} ${esc(x.satuan)} ×${rupiah(x.harga)} <span style="float:right">${rupiah(x.jumlah)}</span></small></p>`).join('')}</div>
    <div class="receipt-line"><strong>Total</strong><strong>${rupiah(r.total)}</strong></div>
    <div class="receipt-line"><span>Bayar</span><span>${rupiah(r.bayar)}</span></div>
    <div class="receipt-line"><span>Kembalian</span><span>${rupiah(r.kembalian)}</span></div>
    <p style="text-align:center;margin-top:22px">Terima kasih telah berbelanja.</p>
  `;
  $('receiptModal').classList.remove('hidden');
}

$('closeReceipt').onclick = () =>$('receiptModal').classList.add('hidden');

$('receiptModal').addEventListener('click', e => {
  if (e.target === $('receiptModal'))$('receiptModal').classList.add('hidden');
});

function receiptText(r) {
  return `*YONS AGEN — STRUK BELANJA*\nJl. Parungseah RT.04/RW.06, Sukabumi\nNo: ${r.id}\nTanggal: ${r.tanggal}\nPelanggan: ${r.pelanggan}\n\n${r.items.map(x => `${x.nama}\n${x.qty}${x.satuan} x ${rupiah(x.harga)} =${rupiah(x.jumlah)}`).join('\n')}\n\n*TOTAL: ${rupiah(r.total)}*\nBayar: ${rupiah(r.bayar)}\nKembalian: ${rupiah(r.kembalian)}\n\nTerima kasih telah berbelanja.`;
}

async function makeReceiptJpg(r) {
  const width = 900, pad = 48, contentWidth = width - pad * 2, canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  
  const rows = [];
  const add = (text, size = 27, bold = false, align = 'left', gap = 13) => rows.push({ text: String(text), size, bold, align, gap });
  
  add('YONS AGEN', 40, true, 'center', 12);
  add('Jl. Parungseah RT.04/RW.06, Sukabumi', 22, false, 'center', 8);
  add('HP 089614021972', 22, false, 'center', 22);
  add('STRUK BELANJA', 28, true, 'center', 24);
  add('No. transaksi: ' + r.id, 23, false, 'left', 9);
  add('Tanggal: ' + r.tanggal, 23, false, 'left', 9);
  add('Pelanggan: ' + r.pelanggan, 23, false, 'left', 18);
  add('----------------------------------------------', 22, false, 'center', 10);
  
  r.items.forEach(x => {
    add(x.nama, 25, true, 'left', 7);
    add(`${x.qty} ${x.satuan} × ${rupiah(x.harga)} = ${rupiah(x.jumlah)}`, 22, false, 'left', 14);
  });
  
  add('----------------------------------------------', 22, false, 'center', 12);
  add('TOTAL: ' + rupiah(r.total), 30, true, 'left', 13);
  add('Bayar: ' + rupiah(r.bayar), 24, false, 'left', 10);
  add('Kembalian: ' + rupiah(r.kembalian), 24, false, 'left', 22);
  add('Terima kasih telah berbelanja.', 23, false, 'center', 12);
  
  const wrapped = [];
  for (const row of rows) {
    ctx.font = `${row.bold ? 'bold ' : ''}${row.size}px Arial`;
    const words = row.text.split(' ');
    let line = '';
    
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > contentWidth && line) {
        wrapped.push({ ...row, text: line });
        line = word;
      } else {
        line = test;
      }
    }
    wrapped.push({ ...row, text: line });
    wrapped.push({ size: 1, gap: row.gap, spacer: true });
  }
  
  let height = pad * 2;
  wrapped.forEach(x => height += x.spacer ? x.gap : x.size + 9);
  
  canvas.width = width;
  canvas.height = height;
  ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  
  let y = pad;
  ctx.fillStyle = '#172126';
  
  wrapped.forEach(row => {
    if (row.spacer) {
      y += row.gap;
      return;
    }
    ctx.font = `${row.bold ? 'bold ' : ''}${row.size}px Arial`;
    ctx.textAlign = row.align;
    const x = row.align === 'center' ? width / 2 : (row.align === 'right' ? width - pad : pad);
    ctx.fillText(row.text, x, y + row.size);
    y += row.size + 9;
  });
  
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(new File([blob], `Struk-Yons-Agen-${r.id}.jpg`, { type: 'image/jpeg' })) : reject(new Error('Gagal membuat gambar struk.')), 'image/jpeg', 0.94));
}

$('shareReceipt').onclick = async () => {
  const r = state.lastReceipt;
  if (!r) return;
  
  const btn = $('shareReceipt');
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = 'Menyiapkan JPG…';
  
  try {
    const file = await makeReceiptJpg(r);
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Struk Yons Agen', text: 'Struk belanja Yons Agen' });
      return;
    }
    
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    
    window.open('https://wa.me/?text=' + encodeURIComponent(receiptText(r)), '_blank', 'noopener');
    alert('Gambar struk JPG sudah diunduh. Di WhatsApp, lampirkan gambar JPG yang baru diunduh untuk mengirim struk sebagai gambar.');
  } catch (e) {
    if (e.name !== 'AbortError') alert('Tidak dapat berbagi JPG otomatis. ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
};

$('printReceipt').onclick = () => window.print();

function parseRupiahInput(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

function formatTargetInput() {
  const el = $('salesTarget');
  const value = parseRupiahInput(el.value);
  el.value = value ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value) : '';
}

$('salesTarget').addEventListener('input', () => {
  const el = $('salesTarget');
  const digits = el.value.replace(/[^0-9]/g, '');
  el.value = digits ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(digits)) : '';
});

$('salesTarget').addEventListener('blur', () => {
  if (!$('salesTarget').value)$('salesTarget').value = '0';
});

$('refreshDashboard').onclick = loadDashboard;
$('applyDashboard').onclick = loadDashboard;

async function loadDashboard() {
  try {
    const r = await api('dashboard', {
      period: $('period').value,
      target: parseRupiahInput($('salesTarget').value)
    });
    state.dashboard = r;
    renderDashboard(r);
  } catch (e) {
    $('dailyBars').innerHTML = '<p class="muted">' + esc(e.message) + '</p>';
    $('productAnalysis').innerHTML = '<p class="muted">' + esc(e.message) + '</p>';
  }
}

function pct(curr, prev) {
  if (!prev) return curr ? '+100%' : '0%';
  const v = (curr - prev) / prev * 100;
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}

function renderDashboard(r) {
  const s = r.summary;
  $('metricRevenue').textContent = rupiah(s.revenue);$('metricTransactions').textContent = s.transactions;
  $('metricItems').textContent = s.items;
  $('metricAverage').textContent = rupiah(s.transactions ? s.revenue / s.transactions : 0);
  $('metricRevenueChange').textContent = 'vs sebelumnya: ' + pct(s.revenue, r.previous.revenue);
  $('metricTransactionsChange').textContent = 'vs sebelumnya: ' + pct(s.transactions, r.previous.transactions);$('metricItemsChange').textContent = 'vs sebelumnya: ' + pct(s.items, r.previous.items);
  
  const target = Number(r.target) || 0;
  const percent = target ? Math.round(s.revenue / target * 100) : 0;
  $('targetPercent').textContent = percent + '%';
  $('targetBar').style.width = Math.min(100, Math.max(0, percent)) + '\%';$('actualLabel').textContent = 'Aktual: ' + rupiah(s.revenue);
  $('targetLabel').textContent = 'Target: ' + rupiah(target);$('comparisonText').textContent = `${pct(s.revenue, r.previous.revenue)} dibanding periode sebelumnya (${rupiah(r.previous.revenue)})`;
  
  const bars = r.daily || [];
  const max = Math.max(1, ...bars.map(x => x.revenue));
  $('dailyBars').innerHTML = bars.length ? bars.map(x => `<div class="bar-col" title="${esc(x.label)}: ${rupiah(x.revenue)}"><div class="bar" style="height:${Math.max(3, Math.round(x.revenue / max * 115))}px"></div><div>${esc(x.label)}</div><div>${x.revenue ? rupiah(x.revenue) : '—'}</div></div>`).join('') : '<p class="muted">Belum ada transaksi.</p>';
  
  const products = r.products || [];
  $('productAnalysis').innerHTML = products.length ? `<table class="analysis-table"><thead><tr><th>Produk</th><th>Qty terjual</th><th>Omzet</th><th>Estimasi laba kotor</th></tr></thead><tbody>${products.map(x => `<tr><td>${esc(x.nama)}</td><td>${Number(x.qty) || 0}${esc(x.satuan || '')}</td><td>${rupiah(x.revenue)}</td><td>${x.grossProfit === null || x.grossProfit === undefined ? '<span class="muted">Belum ada data modal</span>' : rupiah(x.grossProfit)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Belum ada penjualan pada periode ini.</p>';
}

formatTargetInput();
