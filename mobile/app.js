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
        { id: 1, category: 'Burgers', name: 'Classic Burger', price: 89, active: true },
        { id: 2, category: 'Burgers', name: 'Cheese Burger', price: 105, active: true },
        { id: 3, category: 'Burgers', name: 'Double Patty Burger', price: 145, active: true },
        { id: 4, category: 'Sides', name: 'Fries', price: 55, active: true },
        { id: 5, category: 'Sides', name: 'Chicken Nuggets', price: 75, active: true },
        { id: 6, category: 'Drinks', name: 'Iced Tea', price: 35, active: true },
        { id: 7, category: 'Drinks', name: 'Bottled Water', price: 25, active: true },
    ],
    orders: [],
    expenses: [],
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
db.expenses = db.expenses || [];
db.products = db.products.map((product) => ({ ...product, active: product.active !== false }));
db.orders = db.orders.map((order) => ({ ...order, customer: order.customer || {}, paymentMethod: order.paymentMethod || 'cash' }));
let user = store.session();
let tab = 'dashboard';
let cart = new Map();
let scheduleDate = tomorrow();
let reportStart = today();
let reportEnd = today();
let selectedOrderId = null;

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
                <div class="brand"><h1>Drooly's</h1><p>Pre-order management</p></div>
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
    return `
        <div class="metric-grid">
            <div class="metric"><span>Today Sales</span><strong>${peso(todayOrders.reduce((s, o) => s + o.total, 0))}</strong></div>
            <div class="metric"><span>Orders</span><strong>${todayOrders.length}</strong></div>
        </div>
        <section class="panel stack">
            <h2>Pre-order summary</h2>
            <p class="hint">Products are prepared from customer pre-orders. No stock or inventory tracking is used.</p>
        </section>`;
}

function pos() {
    const items = [...cart.values()];
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return `
        <label style="margin:10px 0">Schedule date <input type="date" id="scheduleDate" min="${today()}" value="${scheduleDate}"></label>
        <div class="products">
            ${db.products.filter((p) => p.active).map((p) => `
                <button class="product" data-add="${p.id}">
                    <strong>${p.name}</strong>
                    <span>${peso(p.price)}</span>
                    <small>Available for pre-order</small>
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
            <label>Customer name <input id="customerName" placeholder="Customer name"></label>
            <label>Contact number <input id="customerContact" type="tel" placeholder="Contact number"></label>
            <label>Address <input id="customerAddress" placeholder="Delivery or pickup address"></label>
            <label>Payment method <select id="paymentMethod"><option value="cash">Cash</option><option value="gcash">GCash</option></select></label>
            <label>Amount received <input id="amountReceived" type="number" min="0" step="0.01" value="${total}"></label>
            <button style="width:100%;margin-top:10px" data-action="checkout">Save Pre-order</button>
        </section>`;
}

function preorders() {
    const orders = db.orders.filter((order) => order.mode === 'preorder' && order.scheduledDate >= today());
    const requirements = {};
    orders.filter((order) => order.scheduledDate === scheduleDate).forEach((order) => {
        order.items.forEach((item) => requirements[item.name] = (requirements[item.name] || 0) + item.qty);
    });
    const selectedOrder = db.orders.find((order) => order.id === selectedOrderId);
    return `
        <label>Date <input type="date" id="preorderDate" value="${scheduleDate}"></label>
        <section class="panel stack" style="margin-top:12px">
            <h2>Pre-order items</h2>
            ${Object.keys(requirements).length ? Object.entries(requirements).map(([name, qty]) => `<div class="cart-row"><span>${name}</span><strong>${qty}</strong></div>`).join('') : '<p class="hint">No pre-orders for this date.</p>'}
        </section>
        <section class="panel" style="margin-top:12px">
            <h2>Upcoming Pre-orders</h2>
            <table><tbody>${orders.map((o) => `<tr><td>${o.receipt}<br><small>${o.customer.name || 'No customer name'}</small></td><td>${o.scheduledDate}</td><td><button class="secondary" data-order="${o.id}">View details</button></td></tr>`).join('') || '<tr><td>No pre-orders.</td></tr>'}</tbody></table>
        </section>
        ${selectedOrder ? `<section class="panel stack" style="margin-top:12px"><h2>Order details</h2><p><strong>${selectedOrder.customer.name || 'No customer name'}</strong><br>${selectedOrder.customer.contact || 'No contact number'}<br>${selectedOrder.customer.address || 'No address'}</p><p>${selectedOrder.items.map((item) => `${item.name} x ${item.qty}`).join('<br>')}</p><p>${peso(selectedOrder.total)} · ${selectedOrder.paymentMethod}</p></section>` : ''}`;
}

function reports() {
    const orders = db.orders.filter((order) => {
        const date = order.createdAt.slice(0, 10);
        return date >= reportStart && date <= reportEnd;
    });
    const sales = orders.reduce((sum, order) => sum + order.total, 0);
    const expenses = db.expenses || [];
    const expenseTotal = expenses.filter((expense) => expense.date >= reportStart && expense.date <= reportEnd).reduce((sum, expense) => sum + expense.amount, 0);
    return `
        <label>Report range <select id="reportRange"><option value="custom">Custom range</option><option value="week">This week</option><option value="month">This month</option></select></label>
        <div class="form-grid"><label>Start date <input type="date" id="reportStart" value="${reportStart}"></label><label>End date <input type="date" id="reportEnd" value="${reportEnd}"></label></div>
        <div class="metric-grid" style="margin-top:12px">
            <div class="metric"><span>Sales</span><strong>${peso(sales)}</strong></div>
            <div class="metric"><span>Expenses</span><strong>${peso(expenseTotal)}</strong></div>
            <div class="metric"><span>Orders</span><strong>${orders.length}</strong></div>
        </div>
        <section class="panel stack"><h2>Add expense</h2><input id="expenseDescription" placeholder="Expense description"><input id="expenseAmount" type="number" min="0" step="0.01" placeholder="Amount"><button data-action="saveExpense">Save expense</button></section>
        <section class="panel"><table><tbody>${orders.map((o) => `<tr><td>${o.receipt}<br><small>${o.customer.name || 'No customer name'} · ${o.paymentMethod}</small></td><td>${peso(o.total)}</td></tr>`).join('') || '<tr><td>No orders for this range.</td></tr>'}</tbody></table></section>`;
}

function inventory() {
    return `
        <section class="panel stack">
            <h2>Add / Update Product</h2>
            <input id="pId" type="hidden">
            <input id="pName" placeholder="Product name">
            <input id="pCategory" placeholder="Category">
            <input id="pPrice" type="number" placeholder="Price">
            <button data-action="saveProduct">Save Product</button>
        </section>
        <section class="panel" style="margin-top:12px">
            <h2>Products</h2>
            <table><tbody>${db.products.map((p) => `<tr><td>${p.name}<br><small>${p.category}</small></td><td>${peso(p.price)}</td><td><button class="secondary" data-edit-product="${p.id}">Edit</button></td></tr>`).join('')}</tbody></table>
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
    const existing = cart.get(product.id) || { id: product.id, name: product.name, price: product.price, qty: 0 };
    existing.qty += 1;
    cart.set(product.id, existing);
    render();
}

function checkout() {
    const items = [...cart.values()];
    if (!items.length) return;
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const amountReceived = Number(document.getElementById('amountReceived')?.value || 0);
    if (amountReceived < total) {
        alert('Amount received is lower than total.');
        return;
    }
    db.orders.push({
        id: Date.now(),
        receipt: `DRL-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`,
        userId: user.id,
        mode: 'preorder',
        scheduledDate: scheduleDate,
        items,
        total,
        customer: {
            name: document.getElementById('customerName')?.value.trim() || '',
            contact: document.getElementById('customerContact')?.value.trim() || '',
            address: document.getElementById('customerAddress')?.value.trim() || '',
        },
        paymentMethod: document.getElementById('paymentMethod')?.value || 'cash',
        amountReceived,
        change: amountReceived - total,
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
    if (target.dataset.order) {
        selectedOrderId = Number(target.dataset.order);
        render();
    }
    if (target.dataset.action === 'checkout') checkout();
    if (target.dataset.action === 'saveProduct') {
        const id = Number(document.getElementById('pId').value || 0);
        const product = db.products.find((item) => item.id === id) || { id: Date.now(), active: true };
        product.name = document.getElementById('pName').value.trim();
        product.category = document.getElementById('pCategory').value.trim() || 'General';
        product.price = Number(document.getElementById('pPrice').value || 0);
        if (product.name && !id) db.products.push(product);
        persist();
        render();
    }
    if (target.dataset.editProduct) {
        const product = db.products.find((item) => item.id === Number(target.dataset.editProduct));
        document.getElementById('pId').value = product.id;
        document.getElementById('pName').value = product.name;
        document.getElementById('pCategory').value = product.category;
        document.getElementById('pPrice').value = product.price;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (target.dataset.action === 'saveExpense') {
        const amount = Number(document.getElementById('expenseAmount').value || 0);
        const description = document.getElementById('expenseDescription').value.trim();
        if (description && amount > 0) db.expenses.push({ id: Date.now(), description, amount, date: today() });
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
    if (event.target.id === 'reportStart') {
        reportStart = event.target.value;
        render();
    }
    if (event.target.id === 'reportEnd') {
        reportEnd = event.target.value;
        render();
    }
    if (event.target.id === 'reportRange') {
        const date = new Date();
        if (event.target.value === 'week') date.setDate(date.getDate() - 6);
        if (event.target.value === 'month') date.setDate(1);
        if (event.target.value !== 'custom') reportStart = date.toISOString().slice(0, 10);
        reportEnd = today();
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
