const peso = (value) => `PHP ${Number(value || 0).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
};

const seed = {
    users: [
        { id: 1, name: 'Admin', email: 'admin@droolys.local', password: 'password', role: 'admin' },
        { id: 2, name: 'Cashier', email: 'cashier@droolys.local', password: 'password', role: 'cashier' },
    ],
    categories: ['Burgers', 'Sides', 'Drinks'],
    products: [
        { id: 1, category: 'Burgers', name: 'Classic Burger', price: 89, cost: 42, stock: 80, low: 15, active: true },
        { id: 2, category: 'Burgers', name: 'Cheese Burger', price: 105, cost: 52, stock: 70, low: 15, active: true },
        { id: 3, category: 'Burgers', name: 'Double Patty Burger', price: 145, cost: 78, stock: 45, low: 10, active: true },
        { id: 4, category: 'Sides', name: 'Fries', price: 55, cost: 24, stock: 120, low: 25, active: true },
        { id: 5, category: 'Sides', name: 'Chicken Nuggets', price: 75, cost: 36, stock: 90, low: 20, active: true },
        { id: 6, category: 'Drinks', name: 'Iced Tea', price: 35, cost: 12, stock: 140, low: 30, active: true },
        { id: 7, category: 'Drinks', name: 'Bottled Water', price: 25, cost: 8, stock: 160, low: 30, active: true },
    ],
    orders: [],
    stockMovements: [],
};

const store = {
    read() {
        const saved = localStorage.getItem('droolys.mobile.db');
        if (saved) return JSON.parse(saved);
        this.write(seed);
        return structuredClone(seed);
    },
    write(db) {
        localStorage.setItem('droolys.mobile.db', JSON.stringify(db));
    },
    session() {
        return JSON.parse(localStorage.getItem('droolys.mobile.user') || 'null');
    },
    setSession(user) {
        localStorage.setItem('droolys.mobile.user', JSON.stringify(user));
    },
    logout() {
        localStorage.removeItem('droolys.mobile.user');
    },
};

let db = store.read();
let user = store.session();
let tab = 'dashboard';
let cart = new Map();
let mode = 'direct';
let scheduleDate = tomorrow();
let reportDate = today();

function persist() {
    store.write(db);
}

function appShell(content) {
    const tabs = [
        ['dashboard', 'Home'],
        ['pos', 'POS'],
        ['preorders', 'Orders'],
        ['reports', 'Reports'],
        ['inventory', 'Stock'],
    ].filter(([id]) => id !== 'inventory' || user.role === 'admin');

    return `
        <section class="screen">
            <div class="topbar">
                <div><h1>Drooly's</h1><p>${user.name} · ${user.role}</p></div>
                <button class="secondary" data-action="logout">Logout</button>
            </div>
            ${content}
            <nav class="tabs">
                ${tabs.map(([id, label]) => `<button class="${tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}
            </nav>
        </section>`;
}

function renderLogin(message = '') {
    document.getElementById('app').innerHTML = `
        <section class="login">
            <div class="login-card stack">
                <div class="brand"><h1>Drooly's</h1><p>Standalone mobile POS and inventory</p></div>
                ${message ? `<div class="notice error">${message}</div>` : ''}
                <label>Email <input id="email" value="admin@droolys.local" autocomplete="username"></label>
                <label>Password <input id="password" type="password" value="password" autocomplete="current-password"></label>
                <button data-action="login">Login</button>
                <p class="hint">Admin: admin@droolys.local / password<br>Cashier: cashier@droolys.local / password</p>
            </div>
        </section>`;
}

function dashboard() {
    const todayOrders = db.orders.filter((order) => order.createdAt.slice(0, 10) === today());
    const low = db.products.filter((product) => product.stock <= product.low);
    const profit = todayOrders.reduce((sum, order) => sum + order.total - order.totalCost, 0);
    return `
        <div class="metric-grid">
            <div class="metric"><span>Today Sales</span><strong>${peso(todayOrders.reduce((s, o) => s + o.total, 0))}</strong></div>
            <div class="metric"><span>Today Profit</span><strong>${peso(profit)}</strong></div>
            <div class="metric"><span>Orders</span><strong>${todayOrders.length}</strong></div>
            <div class="metric"><span>Low Stock</span><strong>${low.length}</strong></div>
        </div>
        <section class="panel stack">
            <h2>Low Stock</h2>
            ${low.length ? low.map((p) => `<div class="cart-row"><span>${p.name}</span><strong class="low">${p.stock}</strong></div>`).join('') : '<p class="hint">All stock levels are okay.</p>'}
        </section>`;
}

function pos() {
    const items = [...cart.values()];
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return `
        <div class="mode">
            <button class="${mode === 'direct' ? 'active' : ''}" data-mode="direct">Direct Buy</button>
            <button class="${mode === 'preorder' ? 'active' : ''}" data-mode="preorder">Pre-order</button>
        </div>
        ${mode === 'preorder' ? `<label style="margin:10px 0">Schedule date <input type="date" id="scheduleDate" min="${today()}" value="${scheduleDate}"></label>` : ''}
        <div class="products">
            ${db.products.filter((p) => p.active).map((p) => `
                <button class="product" data-add="${p.id}">
                    <strong>${p.name}</strong>
                    <span>${peso(p.price)}</span>
                    <small>${p.stock} in stock</small>
                </button>`).join('')}
        </div>
        <section class="cart">
            <h2>Cart</h2>
            ${items.length ? items.map((item) => `
                <div class="cart-row">
                    <span>${item.name}<br><small>${peso(item.price)} each</small></span>
                    <div class="qty"><button data-dec="${item.id}">-</button><strong>${item.qty}</strong><button data-inc="${item.id}">+</button></div>
                </div>`).join('') : '<p class="hint">Tap products to add them.</p>'}
            <div class="total-row"><span>Total</span><strong>${peso(total)}</strong></div>
            <label>Cash received <input id="cash" type="number" min="0" step="0.01" value="${total}"></label>
            <button style="width:100%;margin-top:10px" data-action="checkout">Complete Sale</button>
        </section>`;
}

function preorders() {
    const orders = db.orders.filter((order) => order.mode === 'preorder' && order.scheduledDate >= today());
    const requirements = {};
    orders.filter((order) => order.scheduledDate === scheduleDate).forEach((order) => {
        order.items.forEach((item) => requirements[item.name] = (requirements[item.name] || 0) + item.qty);
    });
    return `
        <label>Date <input type="date" id="preorderDate" value="${scheduleDate}"></label>
        <section class="panel stack" style="margin-top:12px">
            <h2>Required Stock</h2>
            ${Object.keys(requirements).length ? Object.entries(requirements).map(([name, qty]) => `<div class="cart-row"><span>${name}</span><strong>${qty}</strong></div>`).join('') : '<p class="hint">No requirements for this date.</p>'}
        </section>
        <section class="panel" style="margin-top:12px">
            <h2>Upcoming Pre-orders</h2>
            <table><tbody>${orders.map((o) => `<tr><td>${o.receipt}</td><td>${o.scheduledDate}</td><td>${peso(o.total)}</td></tr>`).join('') || '<tr><td>No pre-orders.</td></tr>'}</tbody></table>
        </section>`;
}

function reports() {
    const orders = db.orders.filter((order) => order.createdAt.slice(0, 10) === reportDate);
    const sales = orders.reduce((sum, order) => sum + order.total, 0);
    const cost = orders.reduce((sum, order) => sum + order.totalCost, 0);
    return `
        <label>Date <input type="date" id="reportDate" value="${reportDate}"></label>
        <div class="metric-grid" style="margin-top:12px">
            <div class="metric"><span>Sales</span><strong>${peso(sales)}</strong></div>
            <div class="metric"><span>Cost</span><strong>${peso(cost)}</strong></div>
            <div class="metric"><span>Profit</span><strong>${peso(sales - cost)}</strong></div>
            <div class="metric"><span>Orders</span><strong>${orders.length}</strong></div>
        </div>
        <section class="panel"><table><tbody>${orders.map((o) => `<tr><td>${o.receipt}<br><small>${o.mode}</small></td><td>${peso(o.total)}</td></tr>`).join('') || '<tr><td>No sales for this date.</td></tr>'}</tbody></table></section>`;
}

function inventory() {
    return `
        <section class="panel stack">
            <h2>Add / Update Product</h2>
            <input id="pName" placeholder="Product name">
            <input id="pCategory" placeholder="Category">
            <input id="pPrice" type="number" placeholder="Price">
            <input id="pCost" type="number" placeholder="Cost">
            <input id="pStock" type="number" placeholder="Stock">
            <input id="pLow" type="number" placeholder="Low stock alert" value="10">
            <button data-action="saveProduct">Save Product</button>
        </section>
        <section class="panel" style="margin-top:12px">
            <h2>Products</h2>
            <table><tbody>${db.products.map((p) => `<tr><td>${p.name}<br><small>${p.category}</small></td><td>${p.stock}</td><td><button class="secondary" data-stockin="${p.id}">+10</button></td></tr>`).join('')}</tbody></table>
        </section>
        <section class="panel stack" style="margin-top:12px">
            <h2>Backup / Restore</h2>
            <button data-action="export">Export Data</button>
            <label>Import backup <input id="importFile" type="file" accept="application/json"></label>
        </section>`;
}

function render() {
    if (!user) {
        renderLogin();
        return;
    }
    const views = { dashboard, pos, preorders, reports, inventory };
    document.getElementById('app').innerHTML = appShell(views[tab]());
}

function addToCart(id) {
    const product = db.products.find((p) => p.id === Number(id));
    const existing = cart.get(product.id) || { id: product.id, name: product.name, price: product.price, cost: product.cost, qty: 0 };
    if (existing.qty < product.stock) existing.qty += 1;
    cart.set(product.id, existing);
    render();
}

function checkout() {
    const items = [...cart.values()];
    if (!items.length) return;
    const cash = Number(document.getElementById('cash')?.value || 0);
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    if (cash < total) {
        alert('Cash received is lower than total.');
        return;
    }
    items.forEach((item) => {
        const product = db.products.find((p) => p.id === item.id);
        product.stock -= item.qty;
        db.stockMovements.push({ productId: item.id, type: 'out', qty: item.qty, reason: 'Sale', at: new Date().toISOString() });
    });
    db.orders.push({
        id: Date.now(),
        receipt: `DRL-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`,
        userId: user.id,
        mode,
        scheduledDate: mode === 'preorder' ? scheduleDate : null,
        items,
        total,
        totalCost: items.reduce((sum, item) => sum + item.cost * item.qty, 0),
        cash,
        change: cash - total,
        createdAt: new Date().toISOString(),
    });
    cart = new Map();
    persist();
    tab = 'reports';
    render();
}

document.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.tab) {
        tab = target.dataset.tab;
        render();
    }
    if (target.dataset.action === 'login') {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const found = db.users.find((u) => u.email === email && u.password === password);
        if (!found) return renderLogin('Invalid login.');
        user = { id: found.id, name: found.name, role: found.role };
        store.setSession(user);
        render();
    }
    if (target.dataset.action === 'logout') {
        user = null;
        store.logout();
        render();
    }
    if (target.dataset.add) addToCart(target.dataset.add);
    if (target.dataset.inc) addToCart(target.dataset.inc);
    if (target.dataset.dec) {
        const item = cart.get(Number(target.dataset.dec));
        if (item) {
            item.qty -= 1;
            if (item.qty <= 0) cart.delete(item.id);
            render();
        }
    }
    if (target.dataset.mode) {
        mode = target.dataset.mode;
        render();
    }
    if (target.dataset.action === 'checkout') checkout();
    if (target.dataset.action === 'saveProduct') {
        const product = {
            id: Date.now(),
            name: document.getElementById('pName').value,
            category: document.getElementById('pCategory').value || 'General',
            price: Number(document.getElementById('pPrice').value || 0),
            cost: Number(document.getElementById('pCost').value || 0),
            stock: Number(document.getElementById('pStock').value || 0),
            low: Number(document.getElementById('pLow').value || 10),
            active: true,
        };
        if (product.name) db.products.push(product);
        persist();
        render();
    }
    if (target.dataset.stockin) {
        const product = db.products.find((p) => p.id === Number(target.dataset.stockin));
        product.stock += 10;
        db.stockMovements.push({ productId: product.id, type: 'in', qty: 10, reason: 'Mobile quick stock in', at: new Date().toISOString() });
        persist();
        render();
    }
    if (target.dataset.action === 'export') {
        const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `droolys-mobile-backup-${today()}.json`;
        link.click();
    }
});

document.addEventListener('change', (event) => {
    if (event.target.id === 'scheduleDate' || event.target.id === 'preorderDate') {
        scheduleDate = event.target.value;
        render();
    }
    if (event.target.id === 'reportDate') {
        reportDate = event.target.value;
        render();
    }
    if (event.target.id === 'importFile') {
        const file = event.target.files[0];
        if (!file) return;
        file.text().then((text) => {
            db = JSON.parse(text);
            persist();
            render();
        });
    }
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

render();
