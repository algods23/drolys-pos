const peso = (value) => `PHP ${Number(value || 0).toFixed(2)}`;
const philippineDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
}).format(date);
const today = () => philippineDate();
const tomorrow = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return philippineDate(date);
};
const formatTime = (value) => {
    if (!value) return 'Time not set';
    const [hours, minutes] = value.split(':').map(Number);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
};
const timeOptions = (selected = '') => [''].concat(Array.from({ length: 48 }, (_, index) => {
    const hours = Math.floor(index / 2);
    const minutes = index % 2 ? '30' : '00';
    return `${String(hours).padStart(2, '0')}:${minutes}`;
})).map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value ? formatTime(value) : 'Select time'}</option>`).join('');

const seed = {
    users: [
        { id: 1, name: 'Admin', email: 'admin@droolys.local', password: 'password', role: 'admin' },
        { id: 2, name: 'Algods', email: 'Algods@droolys.local', password: 'password', role: 'rider' },
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
db.expenses = (db.expenses || []).map((expense) => ({
    ...expense,
    quantity: Number(expense.quantity || 1),
    amount: Number(expense.amount || 0),
}));
db.products = db.products.map((product) => ({ ...product, active: product.active !== false }));
db.users = db.users.map((account) => account.id === 2 ? { ...account, name: 'Algods', email: 'Algods@droolys.local', role: 'rider' } : account);
db.orders = db.orders.map((order) => ({
    ...order,
    customer: order.customer || {},
    fulfillment: order.fulfillment || 'delivery',
    scheduledTime: order.scheduledTime || '',
    deliveryFee: Number(order.deliveryFee || 0),
    paymentMethod: order.paymentMethod || 'cash',
    amountReceived: Number(order.amountReceived || 0),
    payments: Array.isArray(order.payments) ? order.payments.map((payment) => ({ method: payment.method || 'cash', amount: Number(payment.amount || 0) })) : (Number(order.amountReceived || 0) > 0 ? [{ method: order.paymentMethod || 'cash', amount: Number(order.amountReceived) }] : []),
    status: order.status || (order.amountReceived >= order.total ? 'paid' : 'partial'),
}));
let user = store.session();
if (user?.id === 2) user = { ...user, name: 'Algods', role: 'rider' };
let tab = 'dashboard';
let cart = new Map();
let scheduleDate = tomorrow();
let reportStart = today();
let reportEnd = today();
let homeStart = `${today().slice(0, 8)}01`;
let homeEnd = today();
let cartOpen = false;
let modalOrderId = null;
let reportView = 'sales';
let reportSummaryVisible = false;
let editingExpenseId = null;
let checkoutFulfillment = 'delivery';

function calculateExpenseTotal(expense) {
    return Number(expense.quantity || 1) * Number(expense.amount || 0);
}

function salesAmount(order) {
    return Number(order.total || 0);
}

function isPaidOrder(order) {
    return Number(order.amountReceived || 0) >= Number(order.total || 0);
}

function paymentMethodsLabel(order) {
    return [...new Set((order.payments || []).map((payment) => String(payment.method || 'cash').toUpperCase()))].join(' + ') || String(order.paymentMethod || 'cash').toUpperCase();
}

function reportDate(order) {
    return philippineDate(new Date(order.createdAt));
}

function reportDateLabel(date) {
    return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00+08:00`));
}

function blobAsBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function shareWithAndroid(file, blob, text) {
    const plugins = window.Capacitor?.Plugins;
    if (!plugins?.Filesystem || !plugins?.Share) return false;
    const result = await plugins.Filesystem.writeFile({ path: file.name, data: await blobAsBase64(blob), directory: 'CACHE', recursive: true });
    await plugins.Share.share({ title: "Drooly's sales summary", text, files: [result.uri], dialogTitle: 'Share sales summary' });
    return true;
}

function persist() {
    store.write(db);
}

function appShell(content) {
    const tabs = [
        ['dashboard', 'Home'],
        ['pos', 'POS'],
        ['preorders', 'Orders'],
        ['archived', 'Archived'],
        ['reports', 'Reports'],
        ['inventory', 'Products'],
    ].filter(([id]) => user.role === 'rider' ? ['dashboard', 'preorders'].includes(id) : (id !== 'inventory' || user.role === 'admin'));

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
                <div class="brand"><img class="brand-logo" src="droolys-logo.jpg" alt="Drooly's"><p>Pre-order management</p></div>
                ${message ? `<div class="notice error">${message}</div>` : ''}
                <label>Email <input id="email" value="admin@droolys.local" autocomplete="username"></label>
                <label>Password <input id="password" type="password" value="password" autocomplete="current-password"></label>
                <button data-action="login">Login</button>
            </div>
        </section>`;
}

function dashboard() {
    if (user.role === 'rider') return riderDashboard();
    const selectedDayOrders = db.orders.filter((order) => order.scheduledDate === homeEnd);
    const tomorrowOrders = db.orders.filter((order) => order.scheduledDate === tomorrow() && order.status !== 'delivered');
    const rangeOrders = db.orders.filter((order) => {
        if (!isPaidOrder(order)) return false;
        const date = philippineDate(new Date(order.createdAt));
        return date >= homeStart && date <= homeEnd;
    });
    const chartDays = {};
    rangeOrders.forEach((order) => {
        const date = philippineDate(new Date(order.createdAt));
        chartDays[date] = (chartDays[date] || 0) + salesAmount(order);
    });
    const chartValues = Object.entries(chartDays).sort(([a], [b]) => a.localeCompare(b));
    const chartMax = Math.max(...chartValues.map(([, value]) => value), 1);
    const paidSelectedDayOrders = selectedDayOrders.filter(isPaidOrder);
    const selectedDaySales = paidSelectedDayOrders.reduce((sum, order) => sum + salesAmount(order), 0);
    const selectedDayCash = paidSelectedDayOrders.filter((order) => order.paymentMethod === 'cash').reduce((sum, order) => sum + salesAmount(order), 0);
    const selectedDayGcash = paidSelectedDayOrders.filter((order) => order.paymentMethod === 'gcash').reduce((sum, order) => sum + salesAmount(order), 0);
    return `
            <div class="metric-grid home-metrics">
                <div class="metric"><span>Today sales</span><strong>${peso(selectedDaySales)}</strong><small class="metric-detail">Cash ${peso(selectedDayCash)} · GCash ${peso(selectedDayGcash)}</small></div>
                <div class="metric"><span>Today orders</span><strong>${selectedDayOrders.length}</strong></div>
                <div class="metric"><span>Tomorrow orders</span><strong>${tomorrowOrders.length}</strong></div>
        </div>
        <section class="panel stack">
            <h2>Sales chart</h2>
            <div class="form-grid"><label>From <input type="date" id="homeStart" value="${homeStart}"></label><label>To <input type="date" id="homeEnd" value="${homeEnd}"></label></div>
            <div class="bar-chart">${chartValues.length ? chartValues.map(([date, value]) => `<div class="bar-column"><span>${peso(value)}</span><div class="bar" style="height:${Math.max(8, value / chartMax * 150)}px"></div><small>${date.slice(5)}</small></div>`).join('') : '<p class="hint">No sales in this range.</p>'}</div>
        </section>`;
}

function riderDashboard() {
    const orders = db.orders.filter((order) => order.scheduledDate === today() && order.status !== 'delivered');
    const sales = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const toCollect = orders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.amountReceived || 0)), 0);
    return `<section class="panel stack"><h2>Today's deliveries</h2><div class="metric-grid"><div class="metric"><span>Total sales</span><strong>${peso(sales)}</strong></div><div class="metric"><span>To collect</span><strong>${peso(toCollect)}</strong></div></div><p class="hint">${orders.length} scheduled order${orders.length === 1 ? '' : 's'} today.</p></section>`;
}

function pos() {
    const items = [...cart.values()];
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
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
        <div class="cart-action"><button class="cart-toggle" data-action="toggleCart">${cartOpen ? 'Hide cart' : `Open cart${items.length ? ` (${items.length})` : ''}`}</button></div>
        ${cartOpen ? `<section class="cart">
            <div class="cart-heading"><h2>Cart</h2><button class="secondary" data-action="toggleCart">Hide</button></div>
            ${items.length ? items.map((item) => `
                <div class="cart-row">
                    <span>${item.name}<br><small>${peso(item.price)} each</small></span>
                    <div class="qty"><button data-dec="${item.id}">-</button><strong>${item.qty}</strong><button data-inc="${item.id}">+</button></div>
                </div>`).join('') : '<p class="hint">Tap products to add them.</p>'}
            <div class="total-row"><span>Subtotal</span><strong id="cartSubtotal">${peso(subtotal)}</strong></div>
            <div id="deliveryFeeField" class="${checkoutFulfillment === 'delivery' ? '' : 'hidden'}"><label>Delivery fee <input id="deliveryFee" type="number" min="0" step="0.01" value="0" placeholder="Delivery fee"></label></div>
            <div class="total-row"><span>Payable</span><strong id="cartTotal">${peso(subtotal)}</strong></div>
            <label>Customer name <input id="customerName" placeholder="Customer name" required></label>
            <label>Contact number <input id="customerContact" type="tel" placeholder="Contact number"></label>
            <label>Delivery or pick-up <select id="fulfillment"><option value="delivery" ${checkoutFulfillment === 'delivery' ? 'selected' : ''}>Delivery</option><option value="pickup" ${checkoutFulfillment === 'pickup' ? 'selected' : ''}>Pick-up</option></select></label>
            <label>Order time <select id="scheduledTime">${timeOptions()}</select></label>
            <label>Address or pick-up note <input id="customerAddress" placeholder="Address or pick-up note"></label>
            <label>Payment method <select id="paymentMethod"><option value="cash">Cash</option><option value="gcash">GCash</option></select></label>
            <label>Payment received <input id="amountReceived" type="number" min="0" step="0.01" placeholder="Leave blank if unpaid"></label>
            <button style="width:100%;margin-top:10px" data-action="checkout">Order</button>
        </section>` : ''}`;
}

function preorders() {
    const orders = db.orders.filter((order) => order.mode === 'preorder' && order.status !== 'delivered' && (user.role !== 'rider' || order.scheduledDate === today())).sort((a, b) => `${a.scheduledDate}T${a.scheduledTime || '23:59'}`.localeCompare(`${b.scheduledDate}T${b.scheduledTime || '23:59'}`));
    const routeDate = user.role === 'rider' ? today() : scheduleDate;
    const requirements = {};
    orders.filter((order) => order.scheduledDate === routeDate).forEach((order) => {
        order.items.forEach((item) => requirements[item.name] = (requirements[item.name] || 0) + item.qty);
    });
    return `
        ${user.role === 'rider' ? '<section class="panel"><h2>Today\'s route</h2><p class="hint">Only orders scheduled for today are shown.</p></section>' : `<label>Date <input type="date" id="preorderDate" value="${scheduleDate}"></label>`}
        <section class="panel stack" style="margin-top:12px">
            <h2>Number of items</h2>
            ${Object.keys(requirements).length ? Object.entries(requirements).map(([name, qty]) => `<div class="cart-row"><span>${name}</span><strong>${qty}</strong></div>`).join('') : '<p class="hint">No pre-orders for this date.</p>'}
        </section>
        <section class="panel" style="margin-top:12px">
            <h2>Orders</h2>
            <table><thead><tr><th>Time</th><th>Customer</th><th>Order</th></tr></thead><tbody>${orders.map((o) => `<tr><td><strong>${formatTime(o.scheduledTime)}</strong></td><td><strong>${o.customer.name || 'No customer name'}</strong><br><small>${o.fulfillment === 'pickup' ? 'Pick-up' : 'Delivery'}</small></td><td><small>${o.status} · Balance ${peso(Math.max(0, o.total - o.amountReceived))}</small><br><button class="secondary compact" data-order="${o.id}">View details</button></td></tr>`).join('') || '<tr><td>No pre-orders.</td></tr>'}</tbody></table>
        </section>
        ${orderModal()}${callClientAction()}`;
}

function archived() {
    const orders = db.orders.filter((order) => order.status === 'delivered');
    return `<section class="panel"><h2>Archived orders</h2><table><tbody>${orders.map((o) => `<tr><td>${o.receipt}<br><small>${o.customer.name || 'No customer name'}</small></td><td>${o.scheduledDate}</td><td><button class="secondary" data-order="${o.id}">View details</button></td></tr>`).join('') || '<tr><td>No archived orders.</td></tr>'}</tbody></table></section>${orderModal()}${callClientAction()}`;
}

function callClientAction() {
    if (!modalOrderId) return '';
    const order = db.orders.find((item) => item.id === modalOrderId);
    const phone = (order?.customer.contact || '').replace(/[^+\d]/g, '');
           return phone ? `<a class="call-client centered-call" href="tel:${phone}">Call client</a>` : '';
}

function orderEditor(order) {
    if (user.role === 'rider') return '';
    const productOptions = (selectedId = '') => db.products.filter((product) => product.active).map((product) => `<option value="${product.id}" ${String(product.id) === String(selectedId) ? 'selected' : ''}>${product.name}</option>`).join('');
    const itemRows = order.items.map((item, index) => `<div class="modal-order-item" data-item-index="${index}"><select class="modal-item-product">${productOptions(item.productId || db.products.find((product) => product.name === item.name)?.id)}</select><div class="modal-item-quantity-controls"><button type="button" class="secondary compact" data-action="adjustOrderItem" data-delta="-1">-</button><input class="modal-item-quantity" type="number" min="0" step="1" value="${item.qty}"><button type="button" class="secondary compact" data-action="adjustOrderItem" data-delta="1">+</button></div></div>`).join('');
    return `<section id="orderItemEditor" class="order-item-editor stack hidden"><h3>Items</h3><div id="modalOrderItems">${itemRows}</div><div class="row-actions"><select id="modalNewProduct"><option value="">Add product</option>${productOptions()}</select><button type="button" class="secondary compact" data-action="addOrderItem">Add</button></div><p class="hint">Additional quantities are added to the existing product row.</p></section>`;
}

function orderItemsAction(order) {
    return user.role === 'rider' ? '' : `<button class="secondary compact" data-action="toggleOrderEditor">Update</button>`;
}

function orderModal() {
    const order = db.orders.find((item) => item.id === modalOrderId);
    if (!order) return '';
    const phone = (order.customer.contact || '').replace(/[^+\d]/g, '');
    const balance = Math.max(0, order.total - order.amountReceived);
    const change = Math.max(0, order.amountReceived - order.total);
        const paymentInput = balance > 0 ? `<label>Additional payment received <input id="modalAmountReceived" type="number" min="0" step="0.01" value="" placeholder="Enter next payment"></label><label>Payment method <select id="modalPaymentMethod"><option value="cash">Cash</option><option value="gcash">GCash</option></select></label><button class="compact-action" data-action="updatePayment" data-order-id="${order.id}">Save payment</button>` : `<div class="receipt-change"><span>CHANGE</span><strong>${peso(change)}</strong></div>`;
            const itemEditor = orderEditor(order);
            const customerEditor = user.role === 'rider' ? '' : `<section id="orderEditor" class="edit-order stack hidden"><h3>Update order information</h3><label>Delivery or pick-up <select id="modalFulfillment"><option value="delivery" ${order.fulfillment === 'delivery' ? 'selected' : ''}>Delivery</option><option value="pickup" ${order.fulfillment === 'pickup' ? 'selected' : ''}>Pick-up</option></select></label><label>Order time <input id="modalScheduledTime" type="time" value="${order.scheduledTime}"></label><label>Customer name <input id="modalCustomerName" value="${order.customer.name || ''}"></label><label>Contact number <input id="modalCustomerContact" value="${order.customer.contact || ''}"></label><label>Address or pick-up note <input id="modalCustomerAddress" value="${order.customer.address || ''}"></label><label>Delivery fee <input id="modalDeliveryFee" type="number" min="0" step="0.01" value="${order.deliveryFee || 0}"></label>${itemEditor}<button data-action="updateOrder" data-order-id="${order.id}">Update order</button></section>`;
            const headerActions = `${user.role === 'rider' ? '' : `<button class="secondary compact" data-action="toggleOrderEditor">Update</button><button class="danger compact" data-action="deleteOrder" data-order-id="${order.id}">Delete</button>`}<button class="secondary compact" data-action="closeModal">Close</button>`;
            const completionAction = order.status !== 'delivered' && Number(order.amountReceived || 0) >= Number(order.total || 0) ? `<button class="compact-action" data-action="${order.fulfillment === 'pickup' ? 'markPickedUp' : 'markDelivered'}">${order.fulfillment === 'pickup' ? 'Confirm pick-up' : 'Mark as delivered'}</button>` : '';
            return `<div class="modal-backdrop"><section class="receipt modal ${user.role === 'rider' ? 'rider-receipt' : ''}"><div class="receipt-top"><div><strong>DROOLY'S</strong><small>PRE-ORDER RECEIPT</small></div><div class="receipt-top-actions">${headerActions}</div></div><div class="receipt-meta"><span>${order.receipt}</span><span>${order.scheduledDate} ${formatTime(order.scheduledTime)}</span></div><div class="receipt-customer"><strong>${order.customer.name || 'No customer name'}</strong><span>${order.fulfillment === 'pickup' ? 'PICK-UP' : 'DELIVERY'}</span><span>${phone ? `<a class="call-client" href="tel:${phone}">${order.customer.contact}</a>` : 'No contact number'}</span><span>${order.customer.address || 'No address'}</span></div>${customerEditor}<div class="receipt-items"><div class="receipt-line receipt-label"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>${order.items.map((item) => `<div class="receipt-line"><span>${item.name}</span><span>${item.qty}</span><span>${peso(item.price * item.qty)}</span></div>`).join('')}</div><div class="receipt-totals"><div><span>SUBTOTAL</span><strong>${peso(order.total - Number(order.deliveryFee || 0))}</strong></div>${order.deliveryFee ? `<div><span>DELIVERY FEE</span><strong>${peso(order.deliveryFee)}</strong></div>` : ''}<div><span>TOTAL</span><strong>${peso(order.total)}</strong></div><div><span>RECEIVED</span><strong>${peso(order.amountReceived)}</strong></div><div><span>BALANCE</span><strong>${peso(balance)}</strong></div></div><div class="receipt-status">${paymentMethodsLabel(order)} · ${order.status.toUpperCase()}</div>${paymentInput}${completionAction}</section></div>`;
            return `<div class="modal-backdrop"><section class="receipt modal"><div class="receipt-top"><div><strong>DROOLY'S</strong><small>PRE-ORDER RECEIPT</small></div><div class="receipt-top-actions"><button class="danger compact" data-action="deleteOrder" data-order-id="${order.id}">Delete</button><button class="secondary" data-action="closeModal">Close</button></div></div><div class="receipt-meta"><span>${order.receipt}</span><span>${order.scheduledDate} ${order.scheduledTime || ''}</span></div><div class="receipt-customer"><strong>${order.customer.name || 'No customer name'}</strong><span>${order.fulfillment === 'pickup' ? 'PICK-UP' : 'DELIVERY'}</span><span>${order.customer.contact || 'No contact number'}</span><span>${order.customer.address || 'No address'}</span></div><section class="edit-order stack"><h3>Update order information</h3><label>Delivery or pick-up <select id="modalFulfillment"><option value="delivery" ${order.fulfillment === 'delivery' ? 'selected' : ''}>Delivery</option><option value="pickup" ${order.fulfillment === 'pickup' ? 'selected' : ''}>Pick-up</option></select></label><label>Order time <input id="modalScheduledTime" type="time" value="${order.scheduledTime}"></label><label>Customer name <input id="modalCustomerName" value="${order.customer.name || ''}"></label><label>Contact number <input id="modalCustomerContact" value="${order.customer.contact || ''}"></label><label>Address or pick-up note <input id="modalCustomerAddress" value="${order.customer.address || ''}"></label><button data-action="updateOrder" data-order-id="${order.id}">Update order</button></section><div class="receipt-items"><div class="receipt-line receipt-label"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>${order.items.map((item) => `<div class="receipt-line"><span>${item.name}</span><span>${item.qty}</span><span>${peso(item.price * item.qty)}</span></div>`).join('')}</div><div class="receipt-totals"><div><span>TOTAL</span><strong>${peso(order.total)}</strong></div><div><span>RECEIVED</span><strong>${peso(order.amountReceived)}</strong></div><div><span>BALANCE</span><strong>${peso(balance)}</strong></div>${balance === 0 ? `<div><span>CHANGE</span><strong>${peso(change)}</strong></div>` : ''}</div><div class="receipt-status">${order.paymentMethod.toUpperCase()} · ${order.status.toUpperCase()}</div>${paymentInput}${completionAction}</section></div>`;
                                return `<div class="modal-backdrop"><section class="receipt modal"><div class="receipt-top"><div><strong>DROOLY'S</strong><small>PRE-ORDER RECEIPT</small></div><div class="receipt-top-actions"><button class="danger compact" data-action="deleteOrder" data-order-id="${order.id}">Delete</button><button class="secondary" data-action="closeModal">Close</button></div></div><div class="receipt-meta"><span>${order.receipt}</span><span>${order.scheduledDate} ${order.scheduledTime || ''}</span></div><div class="receipt-customer"><strong>${order.customer.name || 'No customer name'}</strong><span>${order.fulfillment === 'pickup' ? 'PICK-UP' : 'DELIVERY'}</span><span>${order.customer.contact || 'No contact number'}</span><span>${order.customer.address || 'No address'}</span></div><section class="edit-order stack"><h3>Update order information</h3><label>Delivery or pick-up <select id="modalFulfillment"><option value="delivery" ${order.fulfillment === 'delivery' ? 'selected' : ''}>Delivery</option><option value="pickup" ${order.fulfillment === 'pickup' ? 'selected' : ''}>Pick-up</option></select></label><label>Order time <input id="modalScheduledTime" type="time" value="${order.scheduledTime}"></label><label>Customer name <input id="modalCustomerName" value="${order.customer.name || ''}"></label><label>Contact number <input id="modalCustomerContact" value="${order.customer.contact || ''}"></label><label>Address or pick-up note <input id="modalCustomerAddress" value="${order.customer.address || ''}"></label><button data-action="updateOrder" data-order-id="${order.id}">Update order</button></section><div class="receipt-items"><div class="receipt-line receipt-label"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>${order.items.map((item) => `<div class="receipt-line"><span>${item.name}</span><span>${item.qty}</span><span>${peso(item.price * item.qty)}</span></div>`).join('')}</div><div class="receipt-totals"><div><span>TOTAL</span><strong>${peso(order.total)}</strong></div><div><span>RECEIVED</span><strong>${peso(order.amountReceived)}</strong></div><div><span>BALANCE</span><strong>${peso(balance)}</strong></div>${balance === 0 ? `<div><span>CHANGE</span><strong>${peso(change)}</strong></div>` : ''}</div><div class="receipt-status">${order.paymentMethod.toUpperCase()} · ${order.status.toUpperCase()}</div>${paymentInput}${completionAction}</section></div>`;
            return `<div class="modal-backdrop"><section class="receipt modal ${user.role === 'rider' ? 'rider-receipt' : ''}"><div class="receipt-top"><div><strong>DROOLY'S</strong><small>PRE-ORDER RECEIPT</small></div><div class="receipt-top-actions"><button class="danger compact" data-action="deleteOrder" data-order-id="${order.id}">Delete</button><button class="secondary" data-action="closeModal">Close</button></div></div><div class="receipt-meta"><span>${order.receipt}</span><span>${order.scheduledDate} ${order.scheduledTime || ''}</span></div><div class="receipt-customer"><strong>${order.customer.name || 'No customer name'}</strong><span>${order.fulfillment === 'pickup' ? 'PICK-UP' : 'DELIVERY'}</span><span>${order.customer.contact || 'No contact number'}</span><span>${order.customer.address || 'No address'}</span></div><section class="edit-order stack"><h3>Update order information</h3><label>Delivery or pick-up <select id="modalFulfillment"><option value="delivery" ${order.fulfillment === 'delivery' ? 'selected' : ''}>Delivery</option><option value="pickup" ${order.fulfillment === 'pickup' ? 'selected' : ''}>Pick-up</option></select></label><label>Order time <input id="modalScheduledTime" type="time" value="${order.scheduledTime}"></label><label>Customer name <input id="modalCustomerName" value="${order.customer.name || ''}"></label><label>Contact number <input id="modalCustomerContact" value="${order.customer.contact || ''}"></label><label>Address or pick-up note <input id="modalCustomerAddress" value="${order.customer.address || ''}"></label><button data-action="updateOrder" data-order-id="${order.id}">Update order</button></section><div class="receipt-items"><div class="receipt-line receipt-label"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>${order.items.map((item) => `<div class="receipt-line"><span>${item.name}</span><span>${item.qty}</span><span>${peso(item.price * item.qty)}</span></div>`).join('')}</div><div class="receipt-totals"><div><span>TOTAL</span><strong>${peso(order.total)}</strong></div><div><span>RECEIVED</span><strong>${peso(order.amountReceived)}</strong></div><div><span>BALANCE</span><strong>${peso(balance)}</strong></div>${balance === 0 ? `<div><span>CHANGE</span><strong>${peso(change)}</strong></div>` : ''}</div><div class="receipt-status">${order.paymentMethod.toUpperCase()} · ${order.status.toUpperCase()}</div>${paymentInput}${order.status !== 'delivered' ? '<button class="compact-action" data-action="markDelivered">Mark as delivered</button>' : ''}</section></div>`;
        return `<div class="modal-backdrop"><section class="receipt modal"><div class="receipt-top"><div><strong>DROOLY'S</strong><small>PRE-ORDER RECEIPT</small></div><button class="secondary" data-action="closeModal">Close</button></div><div class="receipt-meta"><span>${order.receipt}</span><span>${order.scheduledDate} ${order.scheduledTime || ''}</span></div><div class="receipt-customer"><strong>${order.customer.name || 'No customer name'}</strong><span>${order.fulfillment === 'pickup' ? 'PICK-UP' : 'DELIVERY'}</span><span>${order.customer.contact || 'No contact number'}</span><span>${order.customer.address || 'No address'}</span></div><section class="edit-order stack"><h3>Update order information</h3><label>Delivery or pick-up <select id="modalFulfillment"><option value="delivery" ${order.fulfillment === 'delivery' ? 'selected' : ''}>Delivery</option><option value="pickup" ${order.fulfillment === 'pickup' ? 'selected' : ''}>Pick-up</option></select></label><label>Order time <input id="modalScheduledTime" type="time" value="${order.scheduledTime}"></label><label>Customer name <input id="modalCustomerName" value="${order.customer.name || ''}"></label><label>Contact number <input id="modalCustomerContact" value="${order.customer.contact || ''}"></label><label>Address or pick-up note <input id="modalCustomerAddress" value="${order.customer.address || ''}"></label><button data-action="updateOrder" data-order-id="${order.id}">Update order</button></section><div class="receipt-items"><div class="receipt-line receipt-label"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>${order.items.map((item) => `<div class="receipt-line"><span>${item.name}</span><span>${item.qty}</span><span>${peso(item.price * item.qty)}</span></div>`).join('')}</div><div class="receipt-totals"><div><span>TOTAL</span><strong>${peso(order.total)}</strong></div><div><span>RECEIVED</span><strong>${peso(order.amountReceived)}</strong></div><div><span>BALANCE</span><strong>${peso(balance)}</strong></div>${balance === 0 ? `<div><span>CHANGE</span><strong>${peso(change)}</strong></div>` : ''}</div><div class="receipt-status">${order.paymentMethod.toUpperCase()} · ${order.status.toUpperCase()}</div>${paymentInput}${order.status !== 'delivered' ? '<button class="compact-action" data-action="markDelivered">Mark as delivered</button>' : ''}</section></div>`;
}

function legacyReports() {
    const orders = db.orders.filter((order) => {
        const date = order.createdAt.slice(0, 10);
        return date >= reportStart && date <= reportEnd;
    });
    const sales = orders.reduce((sum, order) => sum + salesAmount(order), 0);
    const expenses = db.expenses || [];
    const expenseTotal = expenses.filter((expense) => expense.date >= reportStart && expense.date <= reportEnd).reduce((sum, expense) => sum + calculateExpenseTotal(expense), 0);
    const productCounts = {};
    orders.forEach((order) => order.items.forEach((item) => productCounts[item.name] = (productCounts[item.name] || 0) + item.qty));
    const selectedExpenses = expenses.filter((expense) => expense.date >= reportStart && expense.date <= reportEnd);
    return `
        <label>Report range <select id="reportRange"><option value="custom">Custom range</option><option value="week">This week</option><option value="month">This month</option></select></label>
        <div class="form-grid"><label>Start date <input type="date" id="reportStart" value="${reportStart}"></label><label>End date <input type="date" id="reportEnd" value="${reportEnd}"></label></div>
        <section class="panel stack"><h2>${editingExpenseId ? 'Edit expense' : 'Add expense'}</h2><input id="expenseDescription" placeholder="Expense description"><input id="expenseQuantity" type="number" min="1" step="1" placeholder="Product quantity"><input id="expenseAmount" type="number" min="0" step="0.01" placeholder="Amount per product"><div class="row-actions"><button class="compact-action" data-action="saveExpense">${editingExpenseId ? 'Update expense' : 'Save expense'}</button>${editingExpenseId ? '<button class="secondary compact-action" data-action="cancelExpenseEdit">Cancel</button>' : ''}</div></section>
        <div class="report-actions"><button class="${reportView === 'sales' ? '' : 'secondary'}" data-action="showSales">Sales</button><button class="${reportView === 'expenses' ? '' : 'secondary'}" data-action="showExpenses">Expenses</button></div>
        ${reportView === 'sales' ? `<section class="panel"><h2>Sales</h2><div class="metric-grid"><div class="metric"><span>Total sales</span><strong>${peso(sales)}</strong></div><div class="metric"><span>Orders</span><strong>${orders.length}</strong></div></div><table><tbody>${orders.map((o) => `<tr><td>${o.customer.name || 'No customer name'}<br><small>${o.paymentMethod}</small></td><td>${peso(salesAmount(o))}</td></tr>`).join('') || '<tr><td>No orders for this range.</td></tr>'}</tbody></table></section>` : `<section class="panel"><h2>Expenses</h2><div class="metric"><span>Total expenses</span><strong>${peso(expenseTotal)}</strong></div><table><thead><tr><th>Expense</th><th>Total</th><th></th></tr></thead><tbody>${selectedExpenses.map((expense) => `<tr><td>${expense.description}<br><small>${expense.quantity} x ${peso(expense.amount)}</small></td><td>${peso(calculateExpenseTotal(expense))}</td><td><div class="row-actions"><button class="secondary compact" data-edit-expense="${expense.id}">Edit</button><button class="danger compact" data-delete-expense="${expense.id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="3">No expenses for this range.</td></tr>'}</tbody></table></section>`}
        ${reportSummaryVisible ? '' : '<button class="compact-action" data-action="toggleReportSummary">Generate summary</button>'}
        ${reportSummaryVisible ? `<section class="panel stack"><h2>Range summary</h2><p>Whole sales: <strong>${peso(sales)}</strong><br>Whole expenses: <strong>${peso(expenseTotal)}</strong><br>Orders count: <strong>${orders.length}</strong><br>Profit: <strong>${peso(sales - expenseTotal)}</strong></p><h3>Products sold</h3>${Object.entries(productCounts).map(([name, count]) => `<div class="cart-row"><span>${name}</span><strong>${count}</strong></div>`).join('') || '<p class="hint">No products sold.</p>'}<h3>Expense descriptions</h3>${selectedExpenses.map((expense) => `<div class="cart-row"><span>${expense.description} · ${expense.quantity || 1} x ${peso(expense.amount)}</span><strong>${peso(calculateExpenseTotal(expense))}</strong></div>`).join('') || '<p class="hint">No expenses recorded.</p>'}</section><div class="report-summary-actions"><button class="secondary" data-action="toggleReportSummary">Hide summary</button><button data-action="shareReportSummary">Create and share JPG</button></div>` : ''}`;
}

function reports() {
    const orders = db.orders.filter((order) => {
        if (!isPaidOrder(order)) return false;
        const date = reportDate(order);
        return date >= reportStart && date <= reportEnd;
    });
    const expenses = db.expenses || [];
    const selectedExpenses = expenses.filter((expense) => expense.date >= reportStart && expense.date <= reportEnd);
    const sales = orders.reduce((sum, order) => sum + salesAmount(order), 0);
    const expenseTotal = selectedExpenses.reduce((sum, expense) => sum + calculateExpenseTotal(expense), 0);
    const productCounts = {};
    orders.forEach((order) => order.items.forEach((item) => productCounts[item.name] = (productCounts[item.name] || 0) + item.qty));
    const salesByDate = orders.reduce((groups, order) => {
        (groups[reportDate(order)] ||= []).push(order);
        return groups;
    }, {});
    const expensesByDate = selectedExpenses.reduce((groups, expense) => {
        (groups[expense.date] ||= []).push(expense);
        return groups;
    }, {});
    const salesRows = Object.entries(salesByDate).sort(([first], [second]) => first.localeCompare(second)).map(([date, dayOrders]) => `<tr><th colspan="2">${reportDateLabel(date)}</th></tr>${dayOrders.map((order) => `<tr><td>${order.customer.name || 'No customer name'}<br><small>${order.paymentMethod}</small></td><td>${peso(salesAmount(order))}</td></tr>`).join('')}`).join('');
    const expenseRows = Object.entries(expensesByDate).sort(([first], [second]) => first.localeCompare(second)).map(([date, dayExpenses]) => `<tr><th colspan="3">${reportDateLabel(date)}</th></tr>${dayExpenses.map((expense) => `<tr><td>${expense.description}<br><small>${expense.quantity} x ${peso(expense.amount)}</small></td><td>${peso(calculateExpenseTotal(expense))}</td><td><div class="row-actions"><button class="secondary compact" data-edit-expense="${expense.id}">Edit</button><button class="danger compact" data-delete-expense="${expense.id}">Delete</button></div></td></tr>`).join('')}`).join('');
    const salesSummary = Object.entries(salesByDate).sort(([first], [second]) => first.localeCompare(second)).map(([date, dayOrders]) => `<div class="cart-row"><span>${reportDateLabel(date)}</span><strong>${peso(dayOrders.reduce((sum, order) => sum + salesAmount(order), 0))}</strong></div>`).join('');
    const expenseSummary = Object.entries(expensesByDate).sort(([first], [second]) => first.localeCompare(second)).map(([date, dayExpenses]) => `<div class="cart-row"><span>${reportDateLabel(date)}</span><strong>${peso(dayExpenses.reduce((sum, expense) => sum + calculateExpenseTotal(expense), 0))}</strong></div>`).join('');
    return `
        <label>Report range <select id="reportRange"><option value="custom">Custom range</option><option value="week">This week</option><option value="month">This month</option></select></label>
        <div class="form-grid"><label>Start date <input type="date" id="reportStart" value="${reportStart}"></label><label>End date <input type="date" id="reportEnd" value="${reportEnd}"></label></div>
        <section class="panel stack"><h2>${editingExpenseId ? 'Edit expense' : 'Add expense'}</h2><input id="expenseDescription" placeholder="Expense description"><input id="expenseQuantity" type="number" min="1" step="1" placeholder="Product quantity"><input id="expenseAmount" type="number" min="0" step="0.01" placeholder="Amount per product"><div class="row-actions"><button class="compact-action" data-action="saveExpense">${editingExpenseId ? 'Update expense' : 'Save expense'}</button>${editingExpenseId ? '<button class="secondary compact-action" data-action="cancelExpenseEdit">Cancel</button>' : ''}</div></section>
        <div class="report-actions"><button class="${reportView === 'sales' ? '' : 'secondary'}" data-action="showSales">Sales</button><button class="${reportView === 'expenses' ? '' : 'secondary'}" data-action="showExpenses">Expenses</button></div>
        ${reportView === 'sales' ? `<section class="panel"><h2>Sales</h2><div class="metric-grid"><div class="metric"><span>Total sales</span><strong>${peso(sales)}</strong></div><div class="metric"><span>Orders</span><strong>${orders.length}</strong></div></div><table><tbody>${salesRows || '<tr><td>No sales for this range.</td></tr>'}</tbody></table></section>` : `<section class="panel"><h2>Expenses</h2><div class="metric"><span>Total expenses</span><strong>${peso(expenseTotal)}</strong></div><table><thead><tr><th>Expense</th><th>Total</th><th></th></tr></thead><tbody>${expenseRows || '<tr><td colspan="3">No expenses for this range.</td></tr>'}</tbody></table></section>`}
        ${reportSummaryVisible ? '' : '<button class="compact-action" data-action="toggleReportSummary">Generate summary</button>'}
        ${reportSummaryVisible ? `<section class="panel stack"><h2>Range summary</h2><p>Whole sales: <strong>${peso(sales)}</strong><br>Whole expenses: <strong>${peso(expenseTotal)}</strong><br>Orders count: <strong>${orders.length}</strong><br>Profit: <strong>${peso(sales - expenseTotal)}</strong></p><h3>Sales by date</h3>${salesSummary || '<p class="hint">No sales recorded.</p>'}<h3>Expenses by date</h3>${expenseSummary || '<p class="hint">No expenses recorded.</p>'}<h3>Products sold</h3>${Object.entries(productCounts).map(([name, count]) => `<div class="cart-row"><span>${name}</span><strong>${count}</strong></div>`).join('') || '<p class="hint">No products sold.</p>'}</section><div class="report-summary-actions"><button class="secondary" data-action="toggleReportSummary">Hide summary</button><button data-action="shareReportSummary">Create and share JPG</button></div>` : ''}`;
}

async function shareReportSummary() {
    const orders = db.orders.filter((order) => {
        if (!isPaidOrder(order)) return false;
        const date = philippineDate(new Date(order.createdAt));
        return date >= reportStart && date <= reportEnd;
    });
    const expenses = (db.expenses || []).filter((expense) => expense.date >= reportStart && expense.date <= reportEnd);
    const sales = orders.reduce((sum, order) => sum + salesAmount(order), 0);
    const expenseTotal = expenses.reduce((sum, expense) => sum + calculateExpenseTotal(expense), 0);
    const productCounts = {};
    orders.forEach((order) => order.items.forEach((item) => productCounts[item.name] = (productCounts[item.name] || 0) + item.qty));
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = Math.max(980, 360 + (orders.length + expenses.length + Object.keys(productCounts).length) * 42);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fffdf8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#d8d0c4';
    context.lineWidth = 3;
    context.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
    const logo = new Image();
    logo.src = './droolys-logo.jpg';
    await new Promise((resolve) => { logo.onload = resolve; logo.onerror = resolve; });
    if (logo.complete && logo.naturalWidth) context.drawImage(logo, 60, 48, 100, 100);
    context.fillStyle = '#17211f';
    context.font = 'bold 42px Lato, Arial, sans-serif';
    context.fillText("DROOLY'S", 190, 88);
    context.font = '22px Lato, Arial, sans-serif';
    context.fillStyle = '#6c665d';
    context.fillText('SALES SUMMARY', 190, 122);
    context.textAlign = 'right';
    context.fillText(`${reportStart} to ${reportEnd}`, 1140, 122);
    context.textAlign = 'left';
    context.strokeStyle = '#9d958a';
    context.setLineDash([10, 8]);
    context.beginPath();
    context.moveTo(60, 170);
    context.lineTo(1140, 170);
    context.stroke();
    context.setLineDash([]);
    const lines = [
        `Whole sales: ${peso(sales)}`,
        `Whole expenses: ${peso(expenseTotal)}`,
        `Orders count: ${orders.length}`,
        `Profit: ${peso(sales - expenseTotal)}`,
        '',
        'Products sold:',
        ...Object.entries(productCounts).map(([name, count]) => `${name}: ${count}`),
        '',
        'Expenses:',
        ...expenses.map((expense) => `${expense.description}: ${expense.quantity} x ${peso(expense.amount)} = ${peso(calculateExpenseTotal(expense))}`),
    ];
    context.font = '25px Lato, Arial, sans-serif';
    lines.forEach((line, index) => context.fillText(line, 60, 225 + index * 38));
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    const file = new File([blob], `droolys-summary-${reportStart}-to-${reportEnd}.jpg`, { type: 'image/jpeg' });
    const shareText = `${reportStart} to ${reportEnd}. Sales: ${peso(sales)}. Expenses: ${peso(expenseTotal)}. Profit: ${peso(sales - expenseTotal)}.`;
    if (await shareWithAndroid(file, blob, shareText)) return;
    if (navigator.share) {
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
            await navigator.share({ title: "Drooly's sales summary", text: `${reportStart} to ${reportEnd}`, files: [file] });
            return;
        }
        await navigator.share({ title: "Drooly's sales summary", text: shareText });
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function inventory() {
    return `
        <section class="panel stack">
            <div class="section-heading"><h2>Add / Update Product</h2><button class="secondary compact" data-action="toggleProductEditor">Show editor</button></div>
            <div id="productEditor" class="stack hidden">
            <input id="pId" type="hidden">
            <input id="pName" placeholder="Product name">
            <input id="pCategory" placeholder="Category">
            <input id="pPrice" type="number" placeholder="Price">
            <button data-action="saveProduct">Save Product</button>
            </div>
        </section>
        <section class="panel" style="margin-top:12px">
            <h2>Products</h2>
            <table><tbody>${db.products.map((p) => `<tr><td>${p.name}<br><small>${p.category}</small></td><td>${peso(p.price)}</td><td><div class="row-actions"><button class="secondary compact" data-edit-product="${p.id}">Edit</button><button class="${p.active ? 'danger' : ''} secondary compact" data-toggle-product="${p.id}">${p.active ? 'Deactivate' : 'Activate'}</button><button class="danger compact" data-delete-product="${p.id}">Delete</button></div></td></tr>`).join('')}</tbody></table>
        </section>
        `;
}

function render() {
    if (!user) {
        renderLogin();
        return;
    }
    const views = { dashboard, pos, preorders, archived, reports, inventory };
    document.getElementById('app').innerHTML = appShell(views[tab]());
    const receiptTotals = document.querySelector('.receipt-totals');
    if (receiptTotals) {
        const rows = [...receiptTotals.children];
        const findRow = (label) => rows.find((row) => row.firstElementChild?.textContent.trim() === label);
        const changeRow = document.querySelector('.receipt-change');
        if (changeRow) receiptTotals.append(changeRow);
        [findRow('TOTAL'), findRow('BALANCE'), findRow('RECEIVED'), changeRow].filter(Boolean).forEach((row) => receiptTotals.append(row));
    }
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
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const customerName = document.getElementById('customerName')?.value.trim() || '';
    if (!customerName) {
        alert('Customer name is required.');
        document.getElementById('customerName')?.focus();
        return;
    }
    const fulfillment = document.getElementById('fulfillment')?.value || 'delivery';
    const deliveryFee = fulfillment === 'delivery' ? Number(document.getElementById('deliveryFee')?.value || 0) : 0;
    if (deliveryFee < 0) return;
    const total = subtotal + deliveryFee;
    if (!confirm(`Create this ${fulfillment === 'delivery' ? 'delivery' : 'pick-up'} order for ${peso(total)}?`)) return;
    const amountReceived = Number(document.getElementById('amountReceived')?.value || 0);
    const paymentMethod = document.getElementById('paymentMethod')?.value || 'cash';
    db.orders.push({
        id: Date.now(),
        receipt: `DRL-${philippineDate().replace(/-/g, '')}-${String(Date.now()).slice(-4)}`,
        userId: user.id,
        mode: 'preorder',
        scheduledDate: scheduleDate,
        scheduledTime: document.getElementById('scheduledTime')?.value || '',
        fulfillment,
        deliveryFee,
        items,
        total,
        customer: {
            name: customerName,
            contact: document.getElementById('customerContact')?.value.trim() || '',
            address: document.getElementById('customerAddress')?.value.trim() || '',
        },
        paymentMethod,
        amountReceived,
        payments: amountReceived > 0 ? [{ method: paymentMethod, amount: amountReceived }] : [],
        change: amountReceived - total,
        status: amountReceived >= total ? 'paid' : 'partial',
        createdAt: new Date().toISOString(),
    });
    cart = new Map();
    persist();
    tab = 'pos';
    cartOpen = false;
    render();
}

document.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.tab) {
        tab = target.dataset.tab;
        render();
    }
    if (target.dataset.action === 'toggleCart') {
        cartOpen = !cartOpen;
        render();
    }
    if (target.dataset.action === 'showSales') {
        reportView = 'sales';
        render();
    }
    if (target.dataset.action === 'showExpenses') {
        reportView = 'expenses';
        render();
    }
    if (target.dataset.action === 'toggleReportSummary') {
        reportSummaryVisible = !reportSummaryVisible;
        render();
    }
    if (target.dataset.action === 'shareReportSummary') shareReportSummary().catch(() => alert('Unable to share the summary image.'));
    if (target.dataset.action === 'cancelExpenseEdit') {
        editingExpenseId = null;
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
    if (target.dataset.orderItemInc || target.dataset.orderItemDec) {
        const order = db.orders.find((item) => item.id === Number(target.dataset.orderItemInc || target.dataset.orderItemDec));
        const item = order?.items[Number(target.dataset.itemIndex)];
        if (user.role !== 'rider' && item) {
            item.qty += target.dataset.orderItemInc ? 1 : -1;
            if (item.qty < 1) item.qty = 1;
            order.total = order.items.reduce((sum, line) => sum + line.price * line.qty, 0) + Number(order.deliveryFee || 0);
            persist();
            render();
        }
    }
    if (target.dataset.order) {
        modalOrderId = Number(target.dataset.order);
        render();
    }
    if (target.dataset.action === 'closeModal') {
        modalOrderId = null;
        render();
    }
    if (target.dataset.action === 'toggleOrderEditor') {
        document.getElementById('orderItemEditor')?.classList.toggle('hidden');
        document.getElementById('orderEditor')?.classList.toggle('hidden');
    }
    if (target.dataset.action === 'adjustOrderItem') {
        const input = target.closest('.modal-order-item')?.querySelector('.modal-item-quantity');
        if (input) input.value = Math.max(0, Number(input.value || 0) + Number(target.dataset.delta || 0));
    }
    if (target.dataset.action === 'addOrderItem') {
        const productId = document.getElementById('modalNewProduct')?.value;
        const product = db.products.find((item) => item.id === Number(productId) && item.active);
        const itemsContainer = document.getElementById('modalOrderItems');
        if (!product || !itemsContainer) return;
        const existingRow = [...itemsContainer.querySelectorAll('.modal-order-item')].find((row) => Number(row.querySelector('.modal-item-product')?.value) === product.id);
        if (existingRow) {
            const quantity = existingRow.querySelector('.modal-item-quantity');
            quantity.value = Number(quantity.value || 0) + 1;
            document.getElementById('modalNewProduct').value = '';
            return;
        }
        const itemIndex = itemsContainer.children.length;
        itemsContainer.insertAdjacentHTML('beforeend', `<div class="modal-order-item" data-item-index="${itemIndex}"><select class="modal-item-product">${db.products.filter((item) => item.active).map((item) => `<option value="${item.id}" ${item.id === product.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select><div class="modal-item-quantity-controls"><button type="button" class="secondary compact" data-action="adjustOrderItem" data-delta="-1">-</button><input class="modal-item-quantity" type="number" min="0" step="1" value="1"><button type="button" class="secondary compact" data-action="adjustOrderItem" data-delta="1">+</button></div></div>`);
        document.getElementById('modalNewProduct').value = '';
    }
    if (target.dataset.action === 'removeOrderItem') {
        target.closest('.modal-order-item')?.remove();
    }
    if (target.dataset.action === 'updateOrder') {
        if (user.role === 'rider') return;
        const order = db.orders.find((item) => item.id === Number(target.dataset.orderId));
        if (!confirm('Save these order changes?')) return;
        order.fulfillment = document.getElementById('modalFulfillment').value;
        order.scheduledTime = document.getElementById('modalScheduledTime').value;
        order.customer.name = document.getElementById('modalCustomerName').value.trim();
        order.customer.contact = document.getElementById('modalCustomerContact').value.trim();
        order.customer.address = document.getElementById('modalCustomerAddress').value.trim();
        const itemRows = [...document.querySelectorAll('.modal-order-item')];
        order.items = itemRows.map((row) => {
                const product = db.products.find((item) => item.id === Number(row.querySelector('.modal-item-product').value));
                return { id: product.id, name: product.name, price: Number(product.price), qty: Number(row.querySelector('.modal-item-quantity').value || 0) };
            }).filter((item) => item.qty > 0);
        order.deliveryFee = order.fulfillment === 'delivery' ? Number(document.getElementById('modalDeliveryFee')?.value || 0) : 0;
        order.total = order.items.reduce((sum, item) => sum + item.price * item.qty, 0) + order.deliveryFee;
        if (order.status !== 'delivered') order.status = Number(order.amountReceived || 0) >= order.total ? 'paid' : 'partial';
        persist();
        render();
    }
    if (target.dataset.action === 'updatePayment') {
        const order = db.orders.find((item) => item.id === Number(target.dataset.orderId));
        const additionalPayment = Number(document.getElementById('modalAmountReceived').value || 0);
        const paymentMethod = document.getElementById('modalPaymentMethod')?.value || 'cash';
        if (!order || additionalPayment <= 0) return;
        const cumulativePayment = Number(order.amountReceived || 0) + additionalPayment;
        if (!confirm(`Save additional payment of ${peso(additionalPayment)}?`)) return;
        order.payments = Array.isArray(order.payments) ? order.payments : (order.amountReceived > 0 ? [{ method: order.paymentMethod || 'cash', amount: Number(order.amountReceived) }] : []);
        order.payments.push({ method: paymentMethod, amount: additionalPayment });
        order.amountReceived = cumulativePayment;
        order.paymentMethod = paymentMethod;
        order.change = Math.max(0, cumulativePayment - order.total);
        order.status = cumulativePayment >= order.total ? 'paid' : 'partial';
        persist();
        render();
    }
    if (target.dataset.action === 'updateOrderItems') {
        if (user.role === 'rider') return;
        const order = db.orders.find((item) => item.id === Number(target.dataset.orderId));
        const deliveryFee = Number(document.getElementById('modalDeliveryFee')?.value || 0);
        if (!order || deliveryFee < 0 || !confirm('Save item quantities and delivery fee?')) return;
        order.deliveryFee = order.fulfillment === 'delivery' ? deliveryFee : 0;
        order.total = order.items.reduce((sum, item) => sum + item.price * item.qty, 0) + order.deliveryFee;
        persist();
        render();
    }
    if (target.dataset.action === 'markDelivered' || target.dataset.action === 'markPickedUp') {
        const order = db.orders.find((item) => item.id === modalOrderId);
        if (!order || Number(order.amountReceived || 0) < Number(order.total || 0)) return;
        if (!confirm(target.dataset.action === 'markPickedUp' ? 'Confirm this pickup order was collected?' : 'Mark this order as delivered?')) return;
        order.status = 'delivered';
        persist();
        modalOrderId = null;
        tab = 'archived';
        render();
    }
    if (target.dataset.action === 'checkout') checkout();
    if (target.dataset.action === 'deleteOrder') {
        if (user.role === 'rider') return;
        if (!confirm('Delete this order permanently?')) return;
        db.orders = db.orders.filter((item) => item.id !== Number(target.dataset.orderId));
        modalOrderId = null;
        persist();
        render();
    }
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
    if (target.dataset.action === 'toggleProductEditor') {
        const editor = document.getElementById('productEditor');
        editor.classList.toggle('hidden');
        target.textContent = editor.classList.contains('hidden') ? 'Show editor' : 'Hide editor';
    }
    if (target.dataset.editProduct) {
        const product = db.products.find((item) => item.id === Number(target.dataset.editProduct));
        document.getElementById('productEditor').classList.remove('hidden');
        document.querySelector('[data-action="toggleProductEditor"]').textContent = 'Hide editor';
        document.getElementById('pId').value = product.id;
        document.getElementById('pName').value = product.name;
        document.getElementById('pCategory').value = product.category;
        document.getElementById('pPrice').value = product.price;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (target.dataset.toggleProduct) {
        const product = db.products.find((item) => item.id === Number(target.dataset.toggleProduct));
        if (!confirm(`${product.active ? 'Deactivate' : 'Activate'} ${product.name}?`)) return;
        product.active = !product.active;
        persist();
        render();
    }
    if (target.dataset.deleteProduct) {
        if (!confirm('Delete this product permanently?')) return;
        db.products = db.products.filter((item) => item.id !== Number(target.dataset.deleteProduct));
        persist();
        render();
    }
    if (target.dataset.action === 'saveExpense') {
        const amount = Number(document.getElementById('expenseAmount').value || 0);
        const description = document.getElementById('expenseDescription').value.trim();
        const quantity = Number(document.getElementById('expenseQuantity').value || 1);
        if (description && amount > 0 && quantity > 0) {
            const expense = db.expenses.find((item) => item.id === editingExpenseId);
            if (expense) {
                expense.description = description;
                expense.quantity = quantity;
                expense.amount = amount;
            } else {
                db.expenses.push({ id: Date.now(), description, quantity, amount, date: today() });
            }
        }
        editingExpenseId = null;
        persist();
        render();
    }
    if (target.dataset.editExpense) {
        editingExpenseId = Number(target.dataset.editExpense);
        const expense = db.expenses.find((item) => item.id === editingExpenseId);
        render();
        document.getElementById('expenseDescription').value = expense.description;
        document.getElementById('expenseQuantity').value = expense.quantity;
        document.getElementById('expenseAmount').value = expense.amount;
        document.getElementById('expenseDescription').focus();
    }
    if (target.dataset.deleteExpense) {
        if (confirm('Delete this expense?')) {
            db.expenses = db.expenses.filter((item) => item.id !== Number(target.dataset.deleteExpense));
            persist();
            render();
        }
    }
});

document.addEventListener('change', (event) => {
    if (event.target.id === 'fulfillment') {
        checkoutFulfillment = event.target.value;
        const feeField = document.getElementById('deliveryFeeField');
        const feeInput = document.getElementById('deliveryFee');
        if (feeField) feeField.classList.toggle('hidden', checkoutFulfillment !== 'delivery');
        if (feeInput && checkoutFulfillment !== 'delivery') feeInput.value = '0';
        updateCartTotal();
    }
    if (event.target.id === 'scheduleDate' || event.target.id === 'preorderDate') {
        scheduleDate = event.target.value;
        render();
    }
    if (event.target.id === 'reportStart') {
        reportStart = event.target.value;
        render();
    }
    if (event.target.id === 'homeStart') {
        homeStart = event.target.value;
        render();
    }
    if (event.target.id === 'homeEnd') {
        homeEnd = event.target.value;
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
        if (event.target.value !== 'custom') reportStart = philippineDate(date);
        reportEnd = today();
        render();
    }
});

document.addEventListener('input', (event) => {
    if (event.target.id === 'deliveryFee') updateCartTotal();
});

function updateCartTotal() {
    const subtotal = [...cart.values()].reduce((sum, item) => sum + item.price * item.qty, 0);
    const fee = checkoutFulfillment === 'delivery' ? Number(document.getElementById('deliveryFee')?.value || 0) : 0;
    const total = document.getElementById('cartTotal');
    if (total) total.textContent = peso(subtotal + fee);
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

render();
