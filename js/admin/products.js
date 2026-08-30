// js/admin/products.js — Product & rate management

async function renderProducts() {
  if (!requireAuth()) return;
  const supabase = getSupabase();

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  document.getElementById('admin-page-title').textContent = 'Products';

  document.getElementById('content').innerHTML = `
    <div class="flex-between mb-2">
      <h2>Products</h2>
      <a href="#/products/new" class="btn btn-primary btn-sm">+ New Product</a>
    </div>

    ${!products || products.length === 0
      ? '<div class="empty-state"><p>No products yet</p></div>'
      : `<table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Base Price</th>
              <th>Sale Price</th>
              <th>User Rate</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${products.map((p) => `
              <tr style="cursor:pointer;" onclick="navigate('#/products/${p.id}/edit')">
                <td><strong>${esc(p.name)}</strong></td>
                <td>${esc(p.sku || '—')}</td>
                <td>${formatCurrency(p.base_price)}</td>
                <td>${formatCurrency(p.sale_price)}</td>
                <td>${formatCurrency(p.default_user_rate)}</td>
                <td>${p.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Inactive</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`}
  `;
}

async function renderProductForm(productId) {
  if (!requireAuth()) return;
  const supabase = getSupabase();
  let product = null;

  if (productId && productId !== 'new') {
    const { data } = await supabase.from('products').select('*').eq('id', productId).single();
    product = data;
  }

  const isEdit = !!product;

  document.getElementById('admin-page-title').textContent = isEdit ? 'Edit Product' : 'New Product';

  document.getElementById('content').innerHTML = `
    <h2 class="mb-2">${isEdit ? 'Edit Product' : 'Create New Product'}</h2>
    <form onsubmit="handleProductSave(event, ${isEdit ? `'${productId}'` : 'null'})">
      <div class="form-group">
        <label>Product Name</label>
        <input type="text" id="prod-name" value="${esc(product?.name || '')}" required>
      </div>
      <div class="form-group">
        <label>SKU</label>
        <input type="text" id="prod-sku" value="${esc(product?.sku || '')}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Base Price (Cost) <span class="text-red">*</span></label>
          <input type="number" id="prod-base" step="0.01" value="${product?.base_price || ''}" required>
          <div class="form-help">Admin-only. Never visible to workers.</div>
        </div>
        <div class="form-group">
          <label>Sale Price <span class="text-red">*</span></label>
          <input type="number" id="prod-sale" step="0.01" value="${product?.sale_price || ''}" required>
          <div class="form-help">Admin-only. Never visible to workers.</div>
        </div>
      </div>
      <div class="form-group">
        <label>Default User Rate (per piece) <span class="text-red">*</span></label>
        <input type="number" id="prod-rate" step="0.01" value="${product?.default_user_rate || ''}" required>
        <div class="form-help">This rate IS visible to workers. It's what they earn per piece.</div>
      </div>
      <div class="form-group">
        <label><input type="checkbox" id="prod-active" ${product?.active !== false ? 'checked' : ''}> Active</label>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${isEdit ? 'Update Product' : 'Create Product'}</button>
    </form>
  `;
}

async function handleProductSave(e, productId) {
  e.preventDefault();
  const supabase = getSupabase();
  const adminUser = app.get('adminUser');

  const productData = {
    name: document.getElementById('prod-name').value,
    sku: document.getElementById('prod-sku').value || null,
    base_price: parseFloat(document.getElementById('prod-base').value),
    sale_price: parseFloat(document.getElementById('prod-sale').value),
    default_user_rate: parseFloat(document.getElementById('prod-rate').value),
    active: document.getElementById('prod-active').checked,
    created_by: adminUser.id,
  };

  let error;
  if (productId) {
    ({ error } = await supabase.from('products').update(productData).eq('id', productId));
  } else {
    ({ error } = await supabase.from('products').insert(productData));
  }

  if (error) {
    showError('Failed to save product: ' + error.message);
    return;
  }

  showToast('Product saved');
  navigate('#/products');
}
