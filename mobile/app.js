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
        { id: 2, name: 'Algods', email: 'algods@droolys.local', password: 'password', role: 'rider' },
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

const remoteMode = Boolean(window.__DROOLYS_REMOTE_DB__);
let remoteDb = remoteMode ? structuredClone(window.__DROOLYS_REMOTE_DB__) : null;
let remoteUser = null;

const store = {
    read() {
        if (remoteMode) return structuredClone(remoteDb || seed);
        const saved = localStorage.getItem('droolys.mobile.db');
        if (saved) return JSON.parse(saved);
        this.write(seed);
        return structuredClone(seed);
    },
    write(db) {
        if (remoteMode) {
            remoteDb = structuredClone(db);
            fetch(`/remote-save${location.search}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(remoteDb),
            }).catch(() => {});
            return;
        }
        localStorage.setItem('droolys.mobile.db', JSON.stringify(db));
    },
    session() {
        if (remoteMode) return remoteUser;
        return JSON.parse(localStorage.getItem('droolys.mobile.user') || 'null');
    },
    setSession(user) {
        if (remoteMode) {
            remoteUser = user;
            return;
        }
        localStorage.setItem('droolys.mobile.user', JSON.stringify(user));
    },
    logout() {
        if (remoteMode) {
            remoteUser = null;
            return;
        }
        localStorage.removeItem('droolys.mobile.user');
    },
};

let db = store.read();
db.expenses = (db.expenses || []).map((expense) => ({
    ...expense,
    quantity: Number(expense.quantity || 1),
    amount: Number(expense.amount || 0),
}));
db.products = db.products.map((product) => ({
    ...product,
    active: product.active !== false,
    piecesPerUnit: productPiecesPerUnit(product),
}));
db.users = db.users.map((account) => account.id === 2 ? { ...account, name: 'Algods', email: 'algods@droolys.local', role: 'rider' } : account);
db.orders = db.orders.map((order) => ({
    ...order,
    customer: order.customer || {},
    fulfillment: order.fulfillment || 'delivery',
    scheduledTime: order.scheduledTime || '',
    deliveryFee: Number(order.deliveryFee || 0),
    paymentMethod: order.paymentMethod || 'cash',
    amountReceived: Number(order.amountReceived || 0),
    tenderedAmount: Number(order.tenderedAmount ?? (Number(order.amountReceived || 0) + Math.max(0, Number(order.change || 0)))),
    payments: Array.isArray(order.payments) ? order.payments.map((payment) => ({ method: payment.method || 'cash', amount: Number(payment.amount || 0), paidAt: payment.paidAt || '' })) : (Number(order.amountReceived || 0) > 0 ? [{ method: order.paymentMethod || 'cash', amount: Number(order.amountReceived), paidAt: order.paidAt || order.createdAt || '' }] : []),
    paidAt: order.paidAt || (Number(order.amountReceived || 0) >= Number(order.total || 0) ? order.createdAt || '' : ''),
    status: order.status || (order.amountReceived >= order.total ? 'paid' : 'partial'),
}));
let user = store.session();
if (user?.id === 2) user = { ...user, name: 'Algods', email: 'algods@droolys.local', role: 'rider' };
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
let confirmationOrderId = null;
let syncStatus = '';
let syncServer = null;
let syncAdmin = null;
let syncListenerReady = false;
let remoteListenerReady = false;
let localPortal = null;
let posCategoryFilter = 'All';
let archivedDateFilter = '';
const LOADING_MIN_MS = 5000;
const appStartedAt = Date.now();
let loadingHideScheduled = false;

function calculateExpenseTotal(expense) {
    return Number(expense.quantity || 1) * Number(expense.amount || 0);
}

function expenseTotalsByDescription(expenses) {
    return expenses.reduce((groups, expense) => {
        groups[expense.description] = (groups[expense.description] || 0) + calculateExpenseTotal(expense);
        return groups;
    }, {});
}

function productCategoryOptions() {
    const fromProducts = db.products.map((product) => product.category).filter(Boolean);
    const fromSeed = db.categories || [];
    return [...new Set([...fromSeed, ...fromProducts])].sort((a, b) => a.localeCompare(b));
}

function expenseFormMarkup() {
    return `<div class="expense-form-columns"><label>Item <input id="expenseDescription" placeholder="Item"></label><div class="expense-form-pair"><label>Quantity <input id="expenseQuantity" type="number" min="1" step="1" placeholder="Quantity"></label><label>Price <input id="expenseAmount" type="number" min="0" step="0.01" placeholder="Price"></label></div></div>`;
}

function salesAmount(order) {
    return Number(order.total || 0);
}

function productPiecesPerUnit(product) {
    const pieces = Number(product?.piecesPerUnit || 1);
    return Number.isFinite(pieces) ? Math.max(1, Math.floor(pieces)) : 1;
}

function soldPieces(item) {
    const product = db.products.find((candidate) => String(candidate.id) === String(item.productId || item.id))
        || db.products.find((candidate) => candidate.name === item.name);
    return Number(item.qty || 0) * productPiecesPerUnit(item.piecesPerUnit ? item : product);
}

function addProductCounts(counts, order) {
    order.items.forEach((item) => {
        counts[item.name] = (counts[item.name] || 0) + soldPieces(item);
    });
    return counts;
}

function totalProductPiecesSold(productCounts) {
    return Object.values(productCounts).reduce((sum, count) => sum + Number(count || 0), 0);
}

function isPaidOrder(order) {
    return Number(order.amountReceived || 0) >= Number(order.total || 0);
}

function orderTendered(order) {
    if (order.tenderedAmount !== undefined && order.tenderedAmount !== null) return Math.max(0, Number(order.tenderedAmount || 0));
    return Math.max(0, Number(order.amountReceived || 0) + Math.max(0, Number(order.change || 0)));
}

function orderChange(order) {
    return Math.max(0, Number(order.change || 0), orderTendered(order) - Number(order.amountReceived || 0));
}

function paymentMethodsLabel(order) {
    if (Number(order.amountReceived || 0) <= 0) return '';
    const totals = paymentBreakdown(order);
    return [
        totals.cash > 0 ? `Cash: ${peso(totals.cash)}` : '',
        totals.gcash > 0 ? `GCash: ${peso(totals.gcash)}` : '',
    ].filter(Boolean).join(' | ');
}

function paymentBreakdown(order) {
    const totals = { cash: 0, gcash: 0 };
    (order.payments || [{ method: order.paymentMethod || 'cash', amount: order.amountReceived || 0 }]).forEach((payment) => {
        const amount = Math.max(0, Number(payment.amount || 0));
        const method = payment.method === 'gcash' ? 'gcash' : 'cash';
        totals[method] += amount;
    });
    return totals;
}

function salesPaymentTotals(orders) {
    return orders.reduce((totals, order) => {
        const breakdown = paymentBreakdown(order);
        totals.cash += breakdown.cash;
        totals.gcash += breakdown.gcash;
        return totals;
    }, { cash: 0, gcash: 0 });
}

function verifyAdminPassword(password) {
    return db.users.some((account) => account.role === 'admin' && account.password === password);
}

function confirmOrderDeletion({ archived = false } = {}) {
    const password = prompt(archived ? 'Enter admin password to delete this archived order:' : 'Enter admin password to delete this order:');
    if (password === null) return false;
    if (!verifyAdminPassword(password)) {
        alert('Incorrect password. Order was not deleted.');
        return false;
    }
    return confirm('Delete this order permanently? This cannot be undone.');
}

function reconcileOrderAfterTotalChange(order) {
    const total = Math.max(0, Number(order.total || 0));
    let received = Math.max(0, Number(order.amountReceived || 0));
    if (received > total) {
        order.amountReceived = total;
        received = total;
        const payments = Array.isArray(order.payments)
            ? order.payments.map((payment) => ({ ...payment, amount: Math.max(0, Number(payment.amount || 0)) }))
            : [];
        let remaining = total;
        order.payments = payments.reduce((trimmed, payment) => {
            if (remaining <= 0) return trimmed;
            const amount = Math.min(payment.amount, remaining);
            if (amount > 0) trimmed.push({ ...payment, amount });
            remaining -= amount;
            return trimmed;
        }, []);
    }
    order.change = Math.max(0, orderTendered(order) - Number(order.amountReceived || 0));
    if (order.status !== 'delivered') {
        order.status = received >= total && total > 0 ? 'paid' : 'partial';
    }
    if (received >= total && total > 0) {
        if (!order.paidAt) order.paidAt = new Date().toISOString();
    } else if (order.status !== 'delivered') {
        order.paidAt = '';
    }
}

let ordersPaymentNormalized = false;
db.orders.forEach((order) => {
    if (Number(order.amountReceived || 0) > Number(order.total || 0)) {
        reconcileOrderAfterTotalChange(order);
        ordersPaymentNormalized = true;
    }
});
if (ordersPaymentNormalized && !remoteMode) store.write(db);

function nextReceiptNumber() {
    const highest = db.orders.reduce((max, order) => {
        const match = String(order.receipt || '').match(/^DRL-(\d+)$/);
        return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `DRL-${String(highest + 1).padStart(2, '0')}`;
}

function reportDate(order) {
    return philippineDate(new Date(order.paidAt || order.createdAt));
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
    refreshLocalPortal();
}

function syncPlugin() {
    return window.Capacitor?.Plugins?.WifiSync;
}

function createLocalAccessCode() {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(36)).join('').slice(0, 10);
}

function localPortalPayload() {
    return JSON.stringify(db);
}

function refreshLocalPortal() {
    if (!localPortal || user?.role !== 'admin' || !syncPlugin()) return;
    syncPlugin().setPortalPayload({
        payload: localPortalPayload(),
        accessCode: localPortal.accessCode,
    }).catch(() => {});
}

function localPortalUrl() {
    if (!localPortal) return '';
    return `http://${localPortal.host}:${localPortal.port}/?key=${localPortal.accessCode}`;
}

function syncOrderKey(order) {
    return String(order?.receipt || '').trim();
}

function isRiderDeliveryOrder(order) {
    return order?.fulfillment !== 'pickup';
}

function todaysSyncOrders() {
    return db.orders.filter((order) => order.scheduledDate === today() && isRiderDeliveryOrder(order) && syncOrderKey(order));
}

function syncPayload(type, orders = []) {
    return JSON.stringify({ version: 2, type, date: today(), orders });
}

function parseSyncPayload(payload) {
    try {
        const parsed = JSON.parse(payload || '{}');
        return {
            type: parsed.type || '',
            date: parsed.date || '',
            orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        };
    } catch {
        return { type: '', date: '', orders: [] };
    }
}

function riderUpdate(order) {
    return {
        receipt: syncOrderKey(order),
        status: order.status,
        amountReceived: Number(order.amountReceived || 0),
        tenderedAmount: orderTendered(order),
        change: Number(order.change || 0),
        paymentMethod: order.paymentMethod || 'cash',
        payments: Array.isArray(order.payments) ? order.payments : [],
        paidAt: order.paidAt || '',
        deliveredAt: order.deliveredAt || '',
    };
}

function importAdminOrders(payload) {
    const { date, orders } = parseSyncPayload(payload);
    if (date && date !== today()) return { added: 0, updated: 0 };
    const localOrders = new Map(db.orders.map((order) => [syncOrderKey(order), order]).filter(([key]) => key));
    let added = 0;
    let updated = 0;

    orders.filter((order) => order?.scheduledDate === today() && isRiderDeliveryOrder(order) && syncOrderKey(order)).forEach((remote) => {
        const key = syncOrderKey(remote);
        const local = localOrders.get(key);
        if (!local) {
            db.orders.push(structuredClone(remote));
            localOrders.set(key, remote);
            added += 1;
            return;
        }

        // Admin owns the order details; Rider owns delivery and payment progress.
        const riderProgress = riderUpdate(local);
        Object.assign(local, structuredClone(remote), riderProgress);
        updated += 1;
    });
    persist();
    return { added, updated };
}

function applyRiderUpdates(payload) {
    const { date, type, orders } = parseSyncPayload(payload);
    if (type !== 'rider-updates' || (date && date !== today())) return { updated: 0, missing: 0 };
    const localOrders = new Map(db.orders.map((order) => [syncOrderKey(order), order]).filter(([key]) => key));
    let updated = 0;
    let missing = 0;

    orders.forEach((remote) => {
        const local = localOrders.get(syncOrderKey(remote));
        if (!local) {
            missing += 1;
            return;
        }
        local.status = remote.status || local.status;
        local.amountReceived = Number(remote.amountReceived || 0);
        local.tenderedAmount = Number(remote.tenderedAmount ?? (remote.amountReceived || 0));
        local.change = Number(remote.change || 0);
        local.paymentMethod = remote.paymentMethod || local.paymentMethod;
        local.payments = Array.isArray(remote.payments) ? remote.payments : local.payments || [];
        local.paidAt = remote.paidAt || local.paidAt || '';
        local.deliveredAt = remote.deliveredAt || local.deliveredAt || '';
        updated += 1;
    });
    persist();
    return { updated, missing };
}

async function setupSyncListener() {
    if (syncListenerReady || !syncPlugin()?.addListener) return;
    syncListenerReady = true;
    await syncPlugin().addListener('syncReceived', async ({ payload }) => {
        if (user?.role !== 'admin') return;
        const result = applyRiderUpdates(payload);
        if (result.updated || result.missing) {
            syncStatus = `Rider updates received: ${result.updated} order${result.updated === 1 ? '' : 's'} updated${result.missing ? `, ${result.missing} order${result.missing === 1 ? '' : 's'} not found` : ''}.`;
            if (syncServer) await syncPlugin().setServerPayload({ payload: syncPayload('admin-orders', todaysSyncOrders()) });
        }
        render();
    });
}

async function setupRemoteListener() {
    if (remoteListenerReady || !syncPlugin()?.addListener) return;
    remoteListenerReady = true;
    await syncPlugin().addListener('remoteDataReceived', ({ payload }) => {
        try {
            const incoming = JSON.parse(payload || '{}');
            if (!Array.isArray(incoming.users) || !Array.isArray(incoming.products) || !Array.isArray(incoming.orders)) return;
            db = incoming;
            persist();
            render();
        } catch {
        }
    });
}

function syncPanel() {
    if (!syncPlugin()) return '';
    if (user.role === 'admin') {
        const portalDetails = localPortal ? `<div class="local-access"><strong>Local admin address</strong><code>${localPortalUrl()}</code><p class="hint">Open this address on a device using the same Wi-Fi. Keep this phone and the app open.</p><button class="secondary compact-action" data-action="stopLocalDashboard">Stop local access</button></div>` : '';
        return `<section class="panel stack"><h2>Wi-Fi sync</h2><p class="hint">Share all orders scheduled for today with the Rider on the same Wi-Fi.</p><button class="compact-action" data-action="shareTodayOrders">Share today's orders</button>${syncServer ? '<p class="notice">Rider can now find this Admin phone automatically.</p>' : ''}${syncStatus ? `<p class="hint">${syncStatus}</p>` : ''}</section><section class="panel stack"><h2>Local admin access</h2><p class="hint">Open your current orders, products, expenses, and sales data on a laptop, PC, or phone using this Wi-Fi only.</p><button class="compact-action" data-action="shareLocalDashboard">${localPortal ? 'Refresh local address' : 'Start local access'}</button>${portalDetails}</section>`;
    }
    return `<section class="panel stack"><h2>Wi-Fi sync</h2><p class="hint">Admin is found automatically while both devices use the same Wi-Fi.</p><div class="row-actions"><button class="compact-action" data-action="receiveTodayOrders">Receive today's orders</button><button class="secondary compact-action" data-action="sendRiderUpdates">Send updates to Admin</button></div>${syncAdmin ? '<p class="notice">Admin found on this Wi-Fi.</p>' : ''}${syncStatus ? `<p class="hint">${syncStatus}</p>` : ''}</section>`;
}

async function shareTodayOrders() {
    if (!syncServer) syncServer = await syncPlugin().startServer({ port: 8765 });
    const orders = todaysSyncOrders();
    await syncPlugin().setServerPayload({ payload: syncPayload('admin-orders', orders) });
    syncStatus = `${orders.length} order${orders.length === 1 ? '' : 's'} scheduled for today are ready for Rider.`;
    render();
}

async function shareLocalDashboard() {
    if (!syncServer) syncServer = await syncPlugin().startServer({ port: 8765 });
    localPortal = {
        host: syncServer.host,
        port: Number(syncServer.port || 8765),
        accessCode: localPortal?.accessCode || createLocalAccessCode(),
    };
    await syncPlugin().setPortalPayload({ payload: localPortalPayload(), accessCode: localPortal.accessCode });
    syncStatus = `Local admin access is ready at ${localPortal.host}:${localPortal.port}.`;
    render();
}

async function stopLocalDashboard() {
    localPortal = null;
    await syncPlugin().setPortalPayload({ payload: '{}', accessCode: '' });
    syncStatus = 'Local admin access stopped.';
    render();
}

async function adminConnection() {
    if (syncAdmin) return syncAdmin;
    const admin = await syncPlugin().discoverAdmin();
    syncAdmin = { host: admin.host, port: Number(admin.port || 8765) };
    return syncAdmin;
}

async function connectToAdmin(payload) {
    try {
        return await syncPlugin().connect({ ...(await adminConnection()), payload });
    } catch (error) {
        syncAdmin = null;
        throw error;
    }
}

async function receiveTodayOrders() {
    const result = await connectToAdmin(syncPayload('request-orders'));
    const { added, updated } = importAdminOrders(result.payload);
    syncStatus = `Received today's orders: ${added} added, ${updated} refreshed.`;
    render();
}

async function sendRiderUpdates() {
    const orders = todaysSyncOrders().map(riderUpdate);
    await connectToAdmin(syncPayload('rider-updates', orders));
    syncStatus = `${orders.length} Rider update${orders.length === 1 ? '' : 's'} sent to Admin.`;
    render();
}

function sendRiderUpdatesAfterPayment() {
    if (user?.role !== 'rider' || !syncPlugin()) return;
    sendRiderUpdates().catch(() => {
        syncStatus = 'Payment saved. Use Send updates to Admin when both phones are on the same Wi-Fi.';
        render();
    });
}

function appShell(content) {
    const tabs = [
        ['dashboard', 'Home'],
        ['pos', 'POS'],
        ['preorders', 'Orders'],
        ['archived', 'Archived'],
        ['reports', 'Reports'],
        ['inventory', 'Products'],
    ].filter(([id]) => user.role === 'rider' ? ['dashboard', 'preorders', 'archived'].includes(id) : (id !== 'inventory' || user.role === 'admin'));

    return `
        <section class="screen">
            <div class="topbar"><div class="topbar-brand"><img class="topbar-logo" src="landing-page.jpg" alt="Drooly's"><span class="topbar-user">${user.name}</span></div><button class="secondary compact" data-action="logout">Logout</button></div>
            ${content}
            <nav class="tabs">${tabs.map(([id, label]) => `<button class="${tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}</nav>
        </section>`;
}

function renderLogin(message = '') {
    document.getElementById('app').innerHTML = `
        <section class="login">
            <div class="login-card stack">
                <div class="brand"><img class="landing-logo" src="landing-page.jpg" alt="Drooly's"></div>
                ${message ? `<div class="notice error">${message}</div>` : ''}
                <label>Email <input id="email" value="admin@droolys.local" autocomplete="username"></label>
                <label>Password <input id="password" type="password" value="password" autocomplete="current-password"></label>
                <button data-action="login">Login</button>
            </div>
        </section>`;
}

function dashboard() {
    if (user.role === 'rider') return riderDashboard();
    const selectedDayOrders = db.orders.filter((order) => order.scheduledDate === homeEnd && order.status !== 'delivered');
    const tomorrowOrders = db.orders.filter((order) => order.scheduledDate === tomorrow() && order.status !== 'delivered');
    const rangeOrders = db.orders.filter((order) => {
        if (!isPaidOrder(order)) return false;
        const date = reportDate(order);
        return date >= homeStart && date <= homeEnd;
    });
    const chartDays = {};
    rangeOrders.forEach((order) => {
        const date = reportDate(order);
        chartDays[date] = (chartDays[date] || 0) + salesAmount(order);
    });
    const chartValues = Object.entries(chartDays).sort(([a], [b]) => a.localeCompare(b));
    const chartMax = Math.max(...chartValues.map(([, value]) => value), 1);
    const todaySalesOrders = db.orders.filter((order) => reportDate(order) === today() && isPaidOrder(order));
    const selectedDaySales = todaySalesOrders.reduce((sum, order) => sum + salesAmount(order), 0);
    const selectedDayCash = todaySalesOrders.reduce((sum, order) => sum + paymentBreakdown(order).cash, 0);
    const selectedDayGcash = todaySalesOrders.reduce((sum, order) => sum + paymentBreakdown(order).gcash, 0);
    return `
            <div class="metric-grid home-metrics">
                <div class="metric today-sales"><span>Today sales</span><strong>${peso(selectedDaySales)}</strong><small class="metric-detail">Cash ${peso(selectedDayCash)}</small><small class="metric-detail">GCash ${peso(selectedDayGcash)}</small></div>
                <div class="metric"><span>Today orders</span><strong>${selectedDayOrders.length}</strong></div>
                <div class="metric"><span>Tomorrow orders</span><strong>${tomorrowOrders.length}</strong></div>
        </div>
        <section class="panel stack">
            <h2>Sales chart</h2>
            <div class="date-range-row"><label>From <input type="date" id="homeStart" value="${homeStart}"></label><label>To <input type="date" id="homeEnd" value="${homeEnd}"></label></div>
            <div class="bar-chart">${chartValues.length ? chartValues.map(([date, value]) => `<div class="bar-column"><span>${peso(value)}</span><div class="bar" style="height:${Math.max(8, value / chartMax * 150)}px"></div><small>${date.slice(5)}</small></div>`).join('') : '<p class="hint">No sales in this range.</p>'}</div>
        </section>${syncPanel()}`;
}

function riderDashboard() {
    const orders = db.orders.filter((order) => order.scheduledDate === today() && isRiderDeliveryOrder(order) && order.status !== 'delivered');
    const sales = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const toCollect = orders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.amountReceived || 0)), 0);
    return `<section class="panel stack"><h2>Today's deliveries</h2><div class="metric-grid"><div class="metric"><span>Total sales</span><strong>${peso(sales)}</strong></div><div class="metric"><span>To collect</span><strong>${peso(toCollect)}</strong></div></div><p class="hint">${orders.length} scheduled order${orders.length === 1 ? '' : 's'} today.</p></section>${syncPanel()}`;
}

function pos() {
    const items = [...cart.values()];
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const categories = ['All', ...productCategoryOptions()];
    const visibleProducts = db.products.filter((product) => product.active && (posCategoryFilter === 'All' || product.category === posCategoryFilter));
    return `
        <div class="pos-controls"><label>Schedule date <input type="date" id="scheduleDate" min="${today()}" value="${scheduleDate}"></label><label>Category <select id="posCategoryFilter">${categories.map((category) => `<option value="${category}" ${category === posCategoryFilter ? 'selected' : ''}>${category}</option>`).join('')}</select></label></div>
        <div class="products">
            ${visibleProducts.map((p) => `
                <button class="product" data-add="${p.id}">
                    <strong>${p.name}</strong>
                    <span>${peso(p.price)}</span>
                    <small>${p.category}</small>
                </button>`).join('') || '<p class="hint">No products in this category.</p>'}
        </div>
        <div class="cart-action"><button class="cart-toggle" data-action="toggleCart">${cartOpen ? 'Hide cart' : `Open cart${items.length ? ` (${items.length})` : ''}`}</button></div>
        ${cartOpen ? `<section class="cart">
            <div class="cart-heading"><h2>Cart</h2></div>
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
            <fieldset class="choice-group"><legend>Delivery or pick-up</legend><label class="choice"><input type="radio" name="fulfillment" value="delivery" ${checkoutFulfillment === 'delivery' ? 'checked' : ''}> Delivery</label><label class="choice"><input type="radio" name="fulfillment" value="pickup" ${checkoutFulfillment === 'pickup' ? 'checked' : ''}> Pick-up</label></fieldset>
            <label>Order time <select id="scheduledTime">${timeOptions()}</select></label>
            <label>Address or pick-up note <input id="customerAddress" placeholder="Address or pick-up note"></label>
            <fieldset class="choice-group"><legend>Payment method</legend><label class="choice"><input type="radio" name="paymentMethod" value="cash" checked> Cash</label><label class="choice"><input type="radio" name="paymentMethod" value="gcash"> GCash</label></fieldset>
            <label>Payment received <input id="amountReceived" type="number" min="0" step="0.01" placeholder="Leave blank if unpaid"></label>
            <button style="width:100%;margin-top:10px" data-action="checkout">Order</button>
        </section>` : ''}${orderConfirmation()}`;
}

    function orderConfirmation() {
        const order = db.orders.find((item) => item.id === confirmationOrderId);
        if (!order) return '';
        const paymentLabel = paymentMethodsLabel(order);
        return `<div class="modal-backdrop"><section class="receipt modal receipt-confirmation"><div class="receipt-top"><div><strong>CHECK ORDER</strong><small>REVIEW BEFORE SERVING</small></div><button class="secondary compact" data-action="closeConfirmation">Close</button></div><div class="receipt-meta"><span>${order.receipt}</span><span class="receipt-schedule"><span>${order.scheduledDate} ${formatTime(order.scheduledTime)}</span><span class="receipt-fulfillment">${order.fulfillment === 'pickup' ? 'PICK-UP' : 'DELIVERY'}</span></span></div><div class="receipt-customer"><div class="receipt-customer-heading"><strong>${order.customer.name}</strong><span class="receipt-order-status">${order.status.toUpperCase()}</span></div></div><div class="receipt-items"><div class="receipt-line receipt-label"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>${order.items.map((item) => `<div class="receipt-line"><span>${item.name}</span><span>${item.qty}</span><span>${peso(item.price * item.qty)}</span></div>`).join('')}</div><div class="receipt-totals"><div><span>TOTAL</span><strong>${peso(order.total)}</strong></div><div><span>RECEIVED</span><strong>${peso(order.amountReceived)}</strong></div></div>${paymentLabel ? `<div class="receipt-status">${paymentLabel}</div>` : ''}<div class="receipt-footer-actions"><button class="compact btn-oneline" data-action="shareOrder" data-order-id="${order.id}">Share receipt</button><button class="secondary compact btn-oneline" data-action="closeConfirmation">Done</button></div></section></div>`;
    }

function preorders() {
    const orders = db.orders.filter((order) => order.mode === 'preorder' && order.status !== 'delivered' && (user.role !== 'rider' || (order.scheduledDate === today() && isRiderDeliveryOrder(order)))).sort((a, b) => `${a.scheduledDate}T${a.scheduledTime || '23:59'}`.localeCompare(`${b.scheduledDate}T${b.scheduledTime || '23:59'}`));
    const routeDate = user.role === 'rider' ? today() : scheduleDate;
    const requirements = {};
    orders.filter((order) => order.scheduledDate === routeDate && !order.bakedAt).forEach((order) => {
        order.items.forEach((item) => requirements[item.name] = (requirements[item.name] || 0) + item.qty);
    });
    return `
        ${user.role === 'rider' ? '<section class="panel"><h2>Today\'s route</h2><p class="hint">Only orders scheduled for today are shown.</p></section>' : `<label>Date <input type="date" id="preorderDate" value="${scheduleDate}"></label>`}
        <section class="panel stack" style="margin-top:12px">
            <h2>Number of items</h2>
            ${Object.keys(requirements).length ? `<div class="item-requirements">${Object.entries(requirements).map(([name, qty]) => `<div class="cart-row"><span>${name}</span><strong>${qty}</strong></div>`).join('')}</div>` : '<p class="hint">No pre-orders for this date.</p>'}
        </section>
        <section class="panel" style="margin-top:12px">
            <h2>Orders</h2>
            <table><thead><tr><th>Time</th><th>Customer</th><th>Order</th></tr></thead><tbody>${orders.map((o) => `<tr><td><strong>${formatTime(o.scheduledTime)}</strong></td><td><strong>${o.customer.name || 'No customer name'}</strong><br><small>${o.fulfillment === 'pickup' ? 'Pick-up' : 'Delivery'}</small></td><td><small>Balance ${peso(Math.max(0, o.total - o.amountReceived))}</small><br><div class="row-actions order-list-actions">${user.role === 'admin' ? `<button class="baked-button compact btn-oneline" data-action="markBaked" data-order-id="${o.id}" ${o.bakedAt ? 'disabled' : ''}>Baked</button>` : ''}<button class="secondary compact btn-oneline" data-order="${o.id}">View details</button></div></td></tr>`).join('') || '<tr><td>No pre-orders.</td></tr>'}</tbody></table>
        </section>
        ${orderModal()}${callClientAction()}`;
}

function archivedOrdersList() {
    const delivered = db.orders.filter((order) => order.status === 'delivered');
    const sorted = delivered.sort((a, b) => `${b.scheduledDate}T${b.scheduledTime || ''}`.localeCompare(`${a.scheduledDate}T${a.scheduledTime || ''}`));
    if (user.role === 'rider') return sorted.filter((order) => order.scheduledDate === today() && isRiderDeliveryOrder(order));
    if (archivedDateFilter) return sorted.filter((order) => order.scheduledDate === archivedDateFilter);
    return sorted;
}

function archived() {
    const orders = archivedOrdersList();
    const dateControl = user.role === 'rider'
        ? `<p class="hint">Showing archived orders for ${reportDateLabel(today())} only.</p>`
        : `<div class="archived-filter-row"><label>Filter by date <input type="date" id="archivedDate" value="${archivedDateFilter}"></label><button type="button" class="secondary compact" data-action="clearArchivedDate">Show all</button></div>${archivedDateFilter ? `<p class="hint">Filtered to ${reportDateLabel(archivedDateFilter)}.</p>` : '<p class="hint">Showing all archived orders.</p>'}`;
    const emptyMessage = user.role === 'rider'
        ? 'No archived orders for today.'
        : (archivedDateFilter ? 'No archived orders for this date.' : 'No archived orders yet.');
    return `${dateControl}<section class="panel"><h2>Archived orders</h2><table><thead><tr><th>Order ID</th><th>Name</th><th></th></tr></thead><tbody>${orders.map((o) => `<tr><td>${o.receipt}</td><td>${o.customer.name || 'No customer name'}</td><td><button class="secondary compact btn-oneline" data-order="${o.id}">View details</button></td></tr>`).join('') || `<tr><td colspan="3">${emptyMessage}</td></tr>`}</tbody></table></section>${orderModal()}${callClientAction()}`;
}

function callClientAction() {
    if (!modalOrderId) return '';
    const order = db.orders.find((item) => item.id === modalOrderId);
    const phone = (order?.customer.contact || '').replace(/[^+\d]/g, '');
           return phone ? `<a class="call-client centered-call" href="tel:${phone}">Call client</a>` : '';
}

function orderEditor(order) {
    if (user.role === 'rider' || order.status === 'delivered') return '';
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
    const change = orderChange(order);
        const paymentInput = balance > 0 ? `<fieldset class="choice-group"><legend>Payment method</legend><label class="choice"><input type="radio" name="modalPaymentMethod" value="cash" checked> Cash</label><label class="choice"><input type="radio" name="modalPaymentMethod" value="gcash"> GCash</label></fieldset><label>Payment received <input id="modalAmountReceived" type="number" min="0" step="0.01" value="" placeholder="Enter next payment"></label>` : `<div class="receipt-change"><span>CHANGE</span><strong>${peso(change)}</strong></div>`;
            const itemEditor = orderEditor(order);
            const customerEditor = user.role === 'rider' ? '' : `<section id="orderEditor" class="edit-order stack hidden"><h3>Update order information</h3><label>Delivery or pick-up <select id="modalFulfillment"><option value="delivery" ${order.fulfillment === 'delivery' ? 'selected' : ''}>Delivery</option><option value="pickup" ${order.fulfillment === 'pickup' ? 'selected' : ''}>Pick-up</option></select></label><label>Order time <input id="modalScheduledTime" type="time" value="${order.scheduledTime}"></label><label>Customer name <input id="modalCustomerName" value="${order.customer.name || ''}"></label><label>Contact number <input id="modalCustomerContact" value="${order.customer.contact || ''}"></label><label>Address or pick-up note <input id="modalCustomerAddress" value="${order.customer.address || ''}"></label><label>Delivery fee <input id="modalDeliveryFee" type="number" min="0" step="0.01" value="${order.deliveryFee || 0}"></label>${itemEditor}<button data-action="updateOrder" data-order-id="${order.id}">Update order</button></section>`;
            const headerActions = `${user.role === 'rider' ? '' : `<button class="secondary compact" data-action="toggleOrderEditor">Update</button>${tab === 'archived' ? `<button class="danger compact" data-action="deleteOrder" data-order-id="${order.id}">Delete</button>` : ''}` }<button class="secondary compact" data-action="closeModal">Close</button>`;
            const completionAction = order.status !== 'delivered' && Number(order.amountReceived || 0) >= Number(order.total || 0) ? `<button class="compact-action" data-action="${order.fulfillment === 'pickup' ? 'markPickedUp' : 'markDelivered'}">${order.fulfillment === 'pickup' ? 'Confirm pick-up' : 'Mark as delivered'}</button>` : '';
            const receiptActions = `${balance > 0 ? `<button class="compact-action" data-action="updatePayment" data-order-id="${order.id}">Save payment</button>` : completionAction}<button class="compact btn-oneline" data-action="shareOrder" data-order-id="${order.id}">Share receipt</button>`;
            const paymentLabel = paymentMethodsLabel(order);
            return `<div class="modal-backdrop"><section class="receipt modal ${user.role === 'rider' ? 'rider-receipt' : ''}"><div class="receipt-top"><div><strong>DROOLY'S</strong><small>PRE-ORDER RECEIPT</small></div><div class="receipt-top-actions">${headerActions}</div></div><div class="receipt-meta"><span>${order.receipt}</span><span class="receipt-schedule"><span>${order.scheduledDate} ${formatTime(order.scheduledTime)}</span><span class="receipt-fulfillment">${order.fulfillment === 'pickup' ? 'PICK-UP' : 'DELIVERY'}</span></span></div><div class="receipt-customer"><div class="receipt-customer-heading"><strong>${order.customer.name || 'No customer name'}</strong><span class="receipt-order-status">${order.status.toUpperCase()}</span></div><span>${phone ? `<a class="call-client" href="tel:${phone}">${order.customer.contact}</a>` : 'No contact number'}</span><span>${order.customer.address || 'No address'}</span></div>${customerEditor}<div class="receipt-items"><div class="receipt-line receipt-label"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>${order.items.map((item) => `<div class="receipt-line"><span>${item.name}</span><span>${item.qty}</span><span>${peso(item.price * item.qty)}</span></div>`).join('')}</div><div class="receipt-totals"><div><span>SUBTOTAL</span><strong>${peso(order.total - Number(order.deliveryFee || 0))}</strong></div>${order.deliveryFee ? `<div><span>DELIVERY FEE</span><strong>${peso(order.deliveryFee)}</strong></div>` : ''}<div><span>TOTAL</span><strong>${peso(order.total)}</strong></div><div><span>RECEIVED</span><strong>${peso(order.amountReceived)}</strong></div><div><span>BALANCE</span><strong>${peso(balance)}</strong></div></div>${paymentLabel ? `<div class="receipt-status">${paymentLabel}</div>` : ''}${paymentInput}<div class="receipt-footer-actions receipt-primary-actions">${receiptActions}</div></section></div>`;
            return `<div class="modal-backdrop"><section class="receipt modal"><div class="receipt-top"><div><strong>DROOLY'S</strong><small>PRE-ORDER RECEIPT</small></div><div class="receipt-top-actions"><button class="danger compact" data-action="deleteOrder" data-order-id="${order.id}">Delete</button><button class="secondary" data-action="closeModal">Close</button></div></div><div class="receipt-meta"><span>${order.receipt}</span><span>${order.scheduledDate} ${order.scheduledTime || ''}</span></div><div class="receipt-customer"><strong>${order.customer.name || 'No customer name'}</strong><span>${order.fulfillment === 'pickup' ? 'PICK-UP' : 'DELIVERY'}</span><span>${order.customer.contact || 'No contact number'}</span><span>${order.customer.address || 'No address'}</span></div><section class="edit-order stack"><h3>Update order information</h3><label>Delivery or pick-up <select id="modalFulfillment"><option value="delivery" ${order.fulfillment === 'delivery' ? 'selected' : ''}>Delivery</option><option value="pickup" ${order.fulfillment === 'pickup' ? 'selected' : ''}>Pick-up</option></select></label><label>Order time <input id="modalScheduledTime" type="time" value="${order.scheduledTime}"></label><label>Customer name <input id="modalCustomerName" value="${order.customer.name || ''}"></label><label>Contact number <input id="modalCustomerContact" value="${order.customer.contact || ''}"></label><label>Address or pick-up note <input id="modalCustomerAddress" value="${order.customer.address || ''}"></label><button data-action="updateOrder" data-order-id="${order.id}">Update order</button></section><div class="receipt-items"><div class="receipt-line receipt-label"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>${order.items.map((item) => `<div class="receipt-line"><span>${item.name}</span><span>${item.qty}</span><span>${peso(item.price * item.qty)}</span></div>`).join('')}</div><div class="receipt-totals"><div><span>TOTAL</span><strong>${peso(order.total)}</strong></div><div><span>RECEIVED</span><strong>${peso(order.amountReceived)}</strong></div><div><span>BALANCE</span><strong>${peso(balance)}</strong></div>${balance === 0 ? `<div><span>CHANGE</span><strong>${peso(change)}</strong></div>` : ''}</div><div class="receipt-status">${order.paymentMethod.toUpperCase()} · ${order.status.toUpperCase()}</div>${paymentInput}${completionAction}</section></div>`;
                                return `<div class="modal-backdrop"><section class="receipt modal"><div class="receipt-top"><div><strong>DROOLY'S</strong><small>PRE-ORDER RECEIPT</small></div><div class="receipt-top-actions"><button class="danger compact" data-action="deleteOrder" data-order-id="${order.id}">Delete</button><button class="secondary" data-action="closeModal">Close</button></div></div><div class="receipt-meta"><span>${order.receipt}</span><span>${order.scheduledDate} ${order.scheduledTime || ''}</span></div><div class="receipt-customer"><strong>${order.customer.name || 'No customer name'}</strong><span>${order.fulfillment === 'pickup' ? 'PICK-UP' : 'DELIVERY'}</span><span>${order.customer.contact || 'No contact number'}</span><span>${order.customer.address || 'No address'}</span></div><section class="edit-order stack"><h3>Update order information</h3><label>Delivery or pick-up <select id="modalFulfillment"><option value="delivery" ${order.fulfillment === 'delivery' ? 'selected' : ''}>Delivery</option><option value="pickup" ${order.fulfillment === 'pickup' ? 'selected' : ''}>Pick-up</option></select></label><label>Order time <input id="modalScheduledTime" type="time" value="${order.scheduledTime}"></label><label>Customer name <input id="modalCustomerName" value="${order.customer.name || ''}"></label><label>Contact number <input id="modalCustomerContact" value="${order.customer.contact || ''}"></label><label>Address or pick-up note <input id="modalCustomerAddress" value="${order.customer.address || ''}"></label><button data-action="updateOrder" data-order-id="${order.id}">Update order</button></section><div class="receipt-items"><div class="receipt-line receipt-label"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>${order.items.map((item) => `<div class="receipt-line"><span>${item.name}</span><span>${item.qty}</span><span>${peso(item.price * item.qty)}</span></div>`).join('')}</div><div class="receipt-totals"><div><span>TOTAL</span><strong>${peso(order.total)}</strong></div><div><span>RECEIVED</span><strong>${peso(order.amountReceived)}</strong></div><div><span>BALANCE</span><strong>${peso(balance)}</strong></div>${balance === 0 ? `<div><span>CHANGE</span><strong>${peso(change)}</strong></div>` : ''}</div><div class="receipt-status">${order.paymentMethod.toUpperCase()} · ${order.status.toUpperCase()}</div>${paymentInput}${completionAction}</section></div>`;
            return `<div class="modal-backdrop"><section class="receipt modal ${user.role === 'rider' ? 'rider-receipt' : ''}"><div class="receipt-top"><div><strong>DROOLY'S</strong><small>PRE-ORDER RECEIPT</small></div><div class="receipt-top-actions"><button class="danger compact" data-action="deleteOrder" data-order-id="${order.id}">Delete</button><button class="secondary" data-action="closeModal">Close</button></div></div><div class="receipt-meta"><span>${order.receipt}</span><span>${order.scheduledDate} ${order.scheduledTime || ''}</span></div><div class="receipt-customer"><strong>${order.customer.name || 'No customer name'}</strong><span>${order.fulfillment === 'pickup' ? 'PICK-UP' : 'DELIVERY'}</span><span>${order.customer.contact || 'No contact number'}</span><span>${order.customer.address || 'No address'}</span></div><section class="edit-order stack"><h3>Update order information</h3><label>Delivery or pick-up <select id="modalFulfillment"><option value="delivery" ${order.fulfillment === 'delivery' ? 'selected' : ''}>Delivery</option><option value="pickup" ${order.fulfillment === 'pickup' ? 'selected' : ''}>Pick-up</option></select></label><label>Order time <input id="modalScheduledTime" type="time" value="${order.scheduledTime}"></label><label>Customer name <input id="modalCustomerName" value="${order.customer.name || ''}"></label><label>Contact number <input id="modalCustomerContact" value="${order.customer.contact || ''}"></label><label>Address or pick-up note <input id="modalCustomerAddress" value="${order.customer.address || ''}"></label><button data-action="updateOrder" data-order-id="${order.id}">Update order</button></section><div class="receipt-items"><div class="receipt-line receipt-label"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>${order.items.map((item) => `<div class="receipt-line"><span>${item.name}</span><span>${item.qty}</span><span>${peso(item.price * item.qty)}</span></div>`).join('')}</div><div class="receipt-totals"><div><span>TOTAL</span><strong>${peso(order.total)}</strong></div><div><span>RECEIVED</span><strong>${peso(order.amountReceived)}</strong></div><div><span>BALANCE</span><strong>${peso(balance)}</strong></div>${balance === 0 ? `<div><span>CHANGE</span><strong>${peso(change)}</strong></div>` : ''}</div><div class="receipt-status">${order.paymentMethod.toUpperCase()} · ${order.status.toUpperCase()}</div>${paymentInput}${order.status !== 'delivered' ? '<button class="compact-action" data-action="markDelivered">Mark as delivered</button>' : ''}</section></div>`;
        return `<div class="modal-backdrop"><section class="receipt modal"><div class="receipt-top"><div><strong>DROOLY'S</strong><small>PRE-ORDER RECEIPT</small></div><button class="secondary" data-action="closeModal">Close</button></div><div class="receipt-meta"><span>${order.receipt}</span><span>${order.scheduledDate} ${order.scheduledTime || ''}</span></div><div class="receipt-customer"><strong>${order.customer.name || 'No customer name'}</strong><span>${order.fulfillment === 'pickup' ? 'PICK-UP' : 'DELIVERY'}</span><span>${order.customer.contact || 'No contact number'}</span><span>${order.customer.address || 'No address'}</span></div><section class="edit-order stack"><h3>Update order information</h3><label>Delivery or pick-up <select id="modalFulfillment"><option value="delivery" ${order.fulfillment === 'delivery' ? 'selected' : ''}>Delivery</option><option value="pickup" ${order.fulfillment === 'pickup' ? 'selected' : ''}>Pick-up</option></select></label><label>Order time <input id="modalScheduledTime" type="time" value="${order.scheduledTime}"></label><label>Customer name <input id="modalCustomerName" value="${order.customer.name || ''}"></label><label>Contact number <input id="modalCustomerContact" value="${order.customer.contact || ''}"></label><label>Address or pick-up note <input id="modalCustomerAddress" value="${order.customer.address || ''}"></label><button data-action="updateOrder" data-order-id="${order.id}">Update order</button></section><div class="receipt-items"><div class="receipt-line receipt-label"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>${order.items.map((item) => `<div class="receipt-line"><span>${item.name}</span><span>${item.qty}</span><span>${peso(item.price * item.qty)}</span></div>`).join('')}</div><div class="receipt-totals"><div><span>TOTAL</span><strong>${peso(order.total)}</strong></div><div><span>RECEIVED</span><strong>${peso(order.amountReceived)}</strong></div><div><span>BALANCE</span><strong>${peso(balance)}</strong></div>${balance === 0 ? `<div><span>CHANGE</span><strong>${peso(change)}</strong></div>` : ''}</div><div class="receipt-status">${order.paymentMethod.toUpperCase()} · ${order.status.toUpperCase()}</div>${paymentInput}${order.status !== 'delivered' ? '<button class="compact-action" data-action="markDelivered">Mark as delivered</button>' : ''}</section></div>`;
}

function legacyReports() {
    const orders = db.orders.filter((order) => {
        const date = reportDate(order);
        return date >= reportStart && date <= reportEnd;
    });
    const sales = orders.reduce((sum, order) => sum + salesAmount(order), 0);
    const expenses = db.expenses || [];
    const expenseTotal = expenses.filter((expense) => expense.date >= reportStart && expense.date <= reportEnd).reduce((sum, expense) => sum + calculateExpenseTotal(expense), 0);
    const productCounts = {};
    orders.forEach((order) => addProductCounts(productCounts, order));
    const selectedExpenses = expenses.filter((expense) => expense.date >= reportStart && expense.date <= reportEnd);
    return `
        <div class="report-range-row"><label>Report range <select id="reportRange"><option value="custom">Custom range</option><option value="week">This week</option><option value="month">This month</option></select></label><label>Start date <input type="date" id="reportStart" value="${reportStart}"></label><label>End date <input type="date" id="reportEnd" value="${reportEnd}"></label></div>
        <section class="panel stack compact-form"><h2>${editingExpenseId ? 'Edit expense' : 'Add expense'}</h2>${expenseFormMarkup()}<div class="row-actions"><button class="compact-action" data-action="saveExpense">${editingExpenseId ? 'Update expense' : 'Save expense'}</button>${editingExpenseId ? '<button class="secondary compact-action" data-action="cancelExpenseEdit">Cancel</button>' : ''}</div></section>
        <div class="report-actions"><button class="${reportView === 'sales' ? '' : 'secondary'}" data-action="showSales">Sales</button><button class="${reportView === 'expenses' ? '' : 'secondary'}" data-action="showExpenses">Expenses</button></div>
        ${reportView === 'sales' ? `<section class="panel"><h2>Sales</h2><div class="metric-grid"><div class="metric"><span>Total sales</span><strong>${peso(sales)}</strong></div><div class="metric"><span>Orders</span><strong>${orders.length}</strong></div></div><table><tbody>${orders.map((o) => `<tr><td>${o.customer.name || 'No customer name'}<br><small>${o.paymentMethod}</small></td><td>${peso(salesAmount(o))}</td></tr>`).join('') || '<tr><td>No orders for this range.</td></tr>'}</tbody></table></section>` : `<section class="panel"><h2>Expenses</h2><div class="metric"><span>Total expenses</span><strong>${peso(expenseTotal)}</strong></div><table><thead><tr><th>Expense</th><th>Total</th><th></th></tr></thead><tbody>${selectedExpenses.map((expense) => `<tr><td>${expense.description}<br><small>${expense.quantity} x ${peso(expense.amount)}</small></td><td>${peso(calculateExpenseTotal(expense))}</td><td><div class="row-actions"><button class="secondary compact" data-edit-expense="${expense.id}">Edit</button><button class="danger compact" data-delete-expense="${expense.id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="3">No expenses for this range.</td></tr>'}</tbody></table></section>`}
        ${reportSummaryVisible ? '' : '<button class="compact-action" data-action="toggleReportSummary">Generate summary</button>'}
        ${reportSummaryVisible ? `<section class="panel stack"><h2>Range summary</h2><p>Whole sales: <strong>${peso(sales)}</strong><br>Whole expenses: <strong>${peso(expenseTotal)}</strong><br>Orders count: <strong>${orders.length}</strong><br>Profit: <strong>${peso(sales - expenseTotal)}</strong></p><h3>Products sold</h3>${Object.entries(productCounts).sort(([first], [second]) => first.localeCompare(second)).map(([name, count]) => `<div class="cart-row"><span>${name}</span><strong>${count} pcs</strong></div>`).join('') || '<p class="hint">No products sold.</p>'}${Object.keys(productCounts).length ? `<div class="summary-total"><span>Total pieces sold</span><strong>${totalProductPiecesSold(productCounts)} pcs</strong></div>` : ''}<h3>Expenses by description</h3>${Object.entries(expenseTotalsByDescription(selectedExpenses)).map(([description, total]) => `<div class="cart-row"><span>${description}</span><strong>${peso(total)}</strong></div>`).join('') || '<p class="hint">No expenses recorded.</p>'}<h3>Expense line items</h3>${selectedExpenses.map((expense) => `<div class="cart-row"><span>${expense.description} · ${expense.quantity || 1} x ${peso(expense.amount)}</span><strong>${peso(calculateExpenseTotal(expense))}</strong></div>`).join('') || '<p class="hint">No expenses recorded.</p>'}</section><div class="report-summary-actions"><button class="secondary" data-action="toggleReportSummary">Hide summary</button><button data-action="shareReportSummary">Create and share JPG</button></div>` : ''}`;
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
    const paymentTotals = salesPaymentTotals(orders);
    const expenseTotal = selectedExpenses.reduce((sum, expense) => sum + calculateExpenseTotal(expense), 0);
    const productCounts = {};
    orders.forEach((order) => addProductCounts(productCounts, order));
    const salesByDate = orders.reduce((groups, order) => {
        (groups[reportDate(order)] ||= []).push(order);
        return groups;
    }, {});
    const expensesByDate = selectedExpenses.reduce((groups, expense) => {
        (groups[expense.date] ||= []).push(expense);
        return groups;
    }, {});
    const salesRows = Object.entries(salesByDate).sort(([first], [second]) => first.localeCompare(second)).map(([date, dayOrders]) => `<tr><th colspan="2">${reportDateLabel(date)}</th></tr>${dayOrders.map((order) => `<tr><td>${order.customer.name || 'No customer name'}<br><small>${paymentMethodsLabel(order) || order.paymentMethod}</small></td><td>${peso(salesAmount(order))}</td></tr>`).join('')}`).join('');
    const expenseRows = Object.entries(expensesByDate).sort(([first], [second]) => first.localeCompare(second)).map(([date, dayExpenses]) => `<tr><th colspan="3">${reportDateLabel(date)}</th></tr>${dayExpenses.map((expense) => `<tr><td>${expense.description}<br><small>${expense.quantity} x ${peso(expense.amount)}</small></td><td>${peso(calculateExpenseTotal(expense))}</td><td><div class="row-actions"><button class="secondary compact" data-edit-expense="${expense.id}">Edit</button><button class="danger compact" data-delete-expense="${expense.id}">Delete</button></div></td></tr>`).join('')}`).join('');
    const salesSummary = Object.entries(salesByDate).sort(([first], [second]) => first.localeCompare(second)).map(([date, dayOrders]) => `<div class="cart-row"><span>${reportDateLabel(date)}</span><strong>${peso(dayOrders.reduce((sum, order) => sum + salesAmount(order), 0))}</strong></div>`).join('');
    const expenseSummary = Object.entries(expensesByDate).sort(([first], [second]) => first.localeCompare(second)).map(([date, dayExpenses]) => `<div class="cart-row"><span>${reportDateLabel(date)}</span><strong>${peso(dayExpenses.reduce((sum, expense) => sum + calculateExpenseTotal(expense), 0))}</strong></div>`).join('');
    const expenseDescriptionSummary = Object.entries(expenseTotalsByDescription(selectedExpenses)).map(([description, total]) => `<div class="cart-row"><span>${description}</span><strong>${peso(total)}</strong></div>`).join('');
    const productPiecesTotal = totalProductPiecesSold(productCounts);
    const productSummary = Object.entries(productCounts).sort(([first], [second]) => first.localeCompare(second)).map(([name, count]) => `<div class="cart-row"><span>${name}</span><strong>${count} pcs</strong></div>`).join('');
    const productSummarySection = productSummary
        ? `<div class="products-sold-grid">${productSummary}</div><div class="summary-total"><span>Total pieces sold</span><strong>${productPiecesTotal} pcs</strong></div>`
        : '<p class="hint">No products sold.</p>';
    return `
        <div class="report-range-row"><label>Report range <select id="reportRange"><option value="custom">Custom range</option><option value="week">This week</option><option value="month">This month</option></select></label><label>Start date <input type="date" id="reportStart" value="${reportStart}"></label><label>End date <input type="date" id="reportEnd" value="${reportEnd}"></label></div>
        <section class="panel stack compact-form"><h2>${editingExpenseId ? 'Edit expense' : 'Add expense'}</h2>${expenseFormMarkup()}<div class="row-actions"><button class="compact-action" data-action="saveExpense">${editingExpenseId ? 'Update expense' : 'Save expense'}</button>${editingExpenseId ? '<button class="secondary compact-action" data-action="cancelExpenseEdit">Cancel</button>' : ''}</div></section>
        <div class="report-actions"><button class="${reportView === 'sales' ? '' : 'secondary'}" data-action="showSales">Sales</button><button class="${reportView === 'expenses' ? '' : 'secondary'}" data-action="showExpenses">Expenses</button></div>
        ${reportView === 'sales' ? `<section class="panel"><h2>Sales</h2><div class="metric-grid"><div class="metric"><span>Total sales</span><strong>${peso(sales)}</strong><small class="metric-detail">Cash ${peso(paymentTotals.cash)}</small><small class="metric-detail">GCash ${peso(paymentTotals.gcash)}</small></div><div class="metric"><span>Orders</span><strong>${orders.length}</strong></div></div><table><tbody>${salesRows || '<tr><td>No sales for this range.</td></tr>'}</tbody></table></section>` : `<section class="panel"><h2>Expenses</h2><div class="metric"><span>Total expenses</span><strong>${peso(expenseTotal)}</strong></div><table><thead><tr><th>Expense</th><th>Total</th><th></th></tr></thead><tbody>${expenseRows || '<tr><td colspan="3">No expenses for this range.</td></tr>'}</tbody></table></section>`}
        ${reportSummaryVisible ? '' : '<button class="compact-action" data-action="toggleReportSummary">Generate summary</button>'}
        ${reportSummaryVisible ? `<section class="panel range-summary"><h2>Range summary</h2><div class="range-summary-grid"><section class="summary-column"><h3>Sales by date</h3><div class="summary-list">${salesSummary || '<p class="hint">No sales recorded.</p>'}</div><div class="summary-total"><span>Total Sales</span><strong>${peso(sales)}</strong></div><div class="cart-row"><span>Cash collected</span><strong>${peso(paymentTotals.cash)}</strong></div><div class="cart-row"><span>GCash collected</span><strong>${peso(paymentTotals.gcash)}</strong></div><div class="summary-profit"><span>Profit</span><strong>${peso(sales - expenseTotal)}</strong></div></section><section class="summary-column"><h3>Expenses by date</h3><div class="summary-list">${expenseSummary || '<p class="hint">No expenses recorded.</p>'}</div><div class="summary-total"><span>Total Expenses</span><strong>${peso(expenseTotal)}</strong></div><h3 class="summary-secondary-heading">Items</h3><div class="summary-list">${expenseDescriptionSummary || '<p class="hint">No items recorded.</p>'}</div></section></div><section class="summary-products"><h3>Products sold</h3>${productSummarySection}</section></section><div class="report-summary-actions"><button class="secondary" data-action="toggleReportSummary">Hide summary</button><button data-action="shareReportSummary">Export Information</button></div>` : ''}`;
}

function drawReportSummaryCanvas(context, {
    sales,
    expenseTotal,
    paymentTotals,
    salesByDate,
    expensesByDate,
    expensesByDescription,
    productCounts,
}) {
    const totalCash = paymentTotals?.cash ?? 0;
    const totalGcash = paymentTotals?.gcash ?? 0;
    const lineHeight = 32;
    const leftX = 60;
    const rightX = 630;
    const salesLines = Object.entries(salesByDate).sort(([first], [second]) => first.localeCompare(second)).map(([date, dayOrders]) => `${reportDateLabel(date)}: ${peso(dayOrders.reduce((sum, order) => sum + salesAmount(order), 0))}`);
    const expenseLines = Object.entries(expensesByDate).sort(([first], [second]) => first.localeCompare(second)).map(([date, dayExpenses]) => `${reportDateLabel(date)}: ${peso(dayExpenses.reduce((sum, expense) => sum + calculateExpenseTotal(expense), 0))}`);
    const descriptionLines = Object.entries(expensesByDescription).sort(([first], [second]) => first.localeCompare(second)).map(([description, total]) => `${description}: ${peso(total)}`);
    const productEntries = Object.entries(productCounts).sort(([first], [second]) => first.localeCompare(second));
    const productPiecesTotal = totalProductPiecesSold(productCounts);
    const twoColRows = Math.max(salesLines.length, expenseLines.length, 1);
    const productRows = Math.max(1, Math.ceil(productEntries.length / 2));
    const leftColumnHeight = 2 * lineHeight + (twoColRows * lineHeight) + 4 * lineHeight + 60;
    const rightColumnHeight = 2 * lineHeight + (twoColRows * lineHeight) + 2 * lineHeight + 34 + (descriptionLines.length || 1) * lineHeight + 60;
    return {
        height: Math.max(700, 260 + Math.max(leftColumnHeight, rightColumnHeight) + productRows * lineHeight + lineHeight),
        draw(startY) {
            let y = startY;
            context.font = 'bold 26px Lato, Arial, sans-serif';
            context.fillText('Sales by date', leftX, y);
            context.fillText('Expenses by date', rightX, y);
            y += lineHeight;
            context.font = '22px Lato, Arial, sans-serif';
            for (let index = 0; index < twoColRows; index += 1) {
                if (salesLines[index]) context.fillText(salesLines[index], leftX, y);
                else if (!salesLines.length && index === 0) context.fillText('No sales recorded.', leftX, y);
                if (expenseLines[index]) context.fillText(expenseLines[index], rightX, y);
                else if (!expenseLines.length && index === 0) context.fillText('No expenses recorded.', rightX, y);
                y += lineHeight;
            }
            y += 12;
            context.font = 'bold 26px Lato, Arial, sans-serif';
            context.fillText('Total Sales', leftX, y);
            context.fillText('Total Expenses', rightX, y);
            y += lineHeight;
            context.font = 'bold 22px Lato, Arial, sans-serif';
            context.fillText(peso(sales), leftX, y);
            context.fillText(peso(expenseTotal), rightX, y);
            y += lineHeight;
            context.font = '22px Lato, Arial, sans-serif';
            context.fillText(`Cash: ${peso(totalCash)}`, leftX, y);
            y += lineHeight;
            context.fillText(`GCash: ${peso(totalGcash)}`, leftX, y);
            y += lineHeight;
            context.font = 'bold 22px Lato, Arial, sans-serif';
            context.fillText(`Profit: ${peso(sales - expenseTotal)}`, leftX, y);
            context.font = 'bold 26px Lato, Arial, sans-serif';
            context.fillText('Items', rightX, y);
            y += lineHeight;
            context.font = '22px Lato, Arial, sans-serif';
            if (descriptionLines.length) descriptionLines.forEach((line, index) => context.fillText(line, rightX, y + index * lineHeight));
            else context.fillText('No items recorded.', rightX, y);
            const productsY = y + Math.max(descriptionLines.length, 1) * lineHeight + 18;
            context.font = 'bold 26px Lato, Arial, sans-serif';
            context.fillText('Products sold', leftX, productsY);
            context.font = '22px Lato, Arial, sans-serif';
            if (!productEntries.length) {
                context.fillText('No products sold.', leftX, productsY + lineHeight);
                return productsY + 2 * lineHeight;
            }
            productEntries.forEach(([name, count], index) => {
                const columnX = index % 2 === 0 ? leftX : rightX;
                const row = Math.floor(index / 2);
                context.fillText(`${name}: ${count} pcs`, columnX, productsY + lineHeight + row * lineHeight);
            });
            const totalY = productsY + lineHeight + productRows * lineHeight;
            context.font = 'bold 22px Lato, Arial, sans-serif';
            context.fillText(`Total pieces sold: ${productPiecesTotal} pcs`, leftX, totalY);
            return totalY + lineHeight;
        },
    };
}

async function shareReportSummary() {
    const orders = db.orders.filter((order) => {
        if (!isPaidOrder(order)) return false;
        const date = reportDate(order);
        return date >= reportStart && date <= reportEnd;
    });
    const expenses = (db.expenses || []).filter((expense) => expense.date >= reportStart && expense.date <= reportEnd);
    const sales = orders.reduce((sum, order) => sum + salesAmount(order), 0);
    const paymentTotals = salesPaymentTotals(orders);
    const expenseTotal = expenses.reduce((sum, expense) => sum + calculateExpenseTotal(expense), 0);
    const productCounts = {};
    orders.forEach((order) => addProductCounts(productCounts, order));
    const salesByDate = orders.reduce((groups, order) => {
        (groups[reportDate(order)] ||= []).push(order);
        return groups;
    }, {});
    const expensesByDate = expenses.reduce((groups, expense) => {
        (groups[expense.date] ||= []).push(expense);
        return groups;
    }, {});
    const expensesByDescription = expenseTotalsByDescription(expenses);
    const layout = drawReportSummaryCanvas(null, {
        sales,
        expenseTotal,
        paymentTotals,
        ordersCount: orders.length,
        salesByDate,
        expensesByDate,
        expensesByDescription,
        productCounts,
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = layout.height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#d8d0c4';
    context.lineWidth = 3;
    context.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
    const logo = new Image();
    logo.src = './droolys-logo.jpg';
    await new Promise((resolve) => { logo.onload = resolve; logo.onerror = resolve; });
    if (logo.complete && logo.naturalWidth) context.drawImage(logo, 60, 48, 92, 92);
    context.fillStyle = '#17211f';
    context.font = 'bold 34px Lato, Arial, sans-serif';
    context.fillText("DROOLY'S", 170, 86);
    context.font = '22px Lato, Arial, sans-serif';
    context.fillStyle = '#6c665d';
    context.fillText('SALES SUMMARY', 170, 118);
    context.textAlign = 'right';
    context.fillText(`${reportStart} to ${reportEnd}`, 1140, 118);
    context.textAlign = 'left';
    context.strokeStyle = '#9d958a';
    context.setLineDash([10, 8]);
    context.beginPath();
    context.moveTo(60, 162);
    context.lineTo(1140, 162);
    context.stroke();
    context.setLineDash([]);
    drawReportSummaryCanvas(context, {
        sales,
        expenseTotal,
        paymentTotals,
        ordersCount: orders.length,
        salesByDate,
        expensesByDate,
        expensesByDescription,
        productCounts,
    }).draw(198);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    const file = new File([blob], `droolys-summary-${reportStart}-to-${reportEnd}.jpg`, { type: 'image/jpeg' });
    const shareText = `${reportStart} to ${reportEnd}. Sales: ${peso(sales)} (Cash ${peso(paymentTotals.cash)}, GCash ${peso(paymentTotals.gcash)}). Expenses: ${peso(expenseTotal)}. Profit: ${peso(sales - expenseTotal)}.`;
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
    const categoryOptions = productCategoryOptions().map((category) => `<option value="${category}">`).join('');
    return `
        <section class="panel stack compact-form inventory-panel">
            <div class="section-heading"><h2>Add / Update Product</h2><button class="secondary compact" data-action="toggleProductEditor">Show editor</button></div>
            <div id="productEditor" class="stack hidden">
            <input id="pId" type="hidden">
            <input id="pName" placeholder="Product name">
            <input id="pCategory" list="categoryOptions" placeholder="Category">
            <datalist id="categoryOptions">${categoryOptions}</datalist>
            <input id="pPrice" type="number" min="0" step="0.01" placeholder="Price">
            <label>Pieces counted per product sold <input id="pPiecesPerUnit" type="number" min="1" step="1" list="pieceCountOptions" value="1"></label>
            <datalist id="pieceCountOptions"><option value="1">1 piece</option><option value="6">6 pieces</option></datalist>
            <button class="compact-action" data-action="saveProduct">Save Product</button>
            </div>
        </section>
        <section class="panel inventory-panel" style="margin-top:12px">
            <h2>Products</h2>
            <table><tbody>${db.products.map((p) => `<tr><td>${p.name}<br><small>${p.category} | ${productPiecesPerUnit(p)} ${productPiecesPerUnit(p) === 1 ? 'piece' : 'pieces'} per sale</small><br><small class="${p.active ? 'status-active' : 'status-inactive'}">${p.active ? 'Active' : 'Inactive'}</small></td><td>${peso(p.price)}</td><td><details class="product-actions"><summary>Actions</summary><div class="row-actions"><button class="secondary compact" data-edit-product="${p.id}">Edit</button><button class="${p.active ? 'danger' : ''} secondary compact" data-toggle-product="${p.id}">${p.active ? 'Deactivate' : 'Activate'}</button><button class="danger compact" data-delete-product="${p.id}">Delete</button></div></details></td></tr>`).join('')}</tbody></table>
        </section>
        `;
}

function hideLoadingScreen() {
    const loading = document.getElementById('loading-screen');
    if (!loading || loading.classList.contains('hidden')) return;
    loading.classList.add('hidden');
    loading.setAttribute('aria-busy', 'false');
}

function scheduleLoadingScreenHide() {
    if (loadingHideScheduled) return;
    loadingHideScheduled = true;
    const remainingDelay = Math.max(0, LOADING_MIN_MS - (Date.now() - appStartedAt));
    window.setTimeout(hideLoadingScreen, remainingDelay);
}

function render() {
    scheduleLoadingScreenHide();
    if (!user) {
        renderLogin();
        return;
    }
    setupSyncListener();
    setupRemoteListener();
    const views = { dashboard, pos, preorders, archived, reports, inventory };
    document.getElementById('app').innerHTML = appShell(views[tab]());
    document.getElementById('app').classList.toggle('reports-view', tab === 'reports');
    if (modalOrderId && db.orders.find((order) => order.id === modalOrderId)?.status === 'delivered') {
        document.getElementById('orderEditor')?.remove();
        document.getElementById('orderItemEditor')?.remove();
        document.querySelectorAll('[data-action="toggleOrderEditor"], [data-action="deleteOrder"]').forEach((button) => button.remove());
        const paymentButton = document.querySelector('[data-action="updatePayment"]');
        paymentButton?.previousElementSibling?.remove();
        paymentButton?.previousElementSibling?.remove();
        paymentButton?.remove();
    }
    const modalTimeInput = document.getElementById('modalScheduledTime');
    if (modalTimeInput) modalTimeInput.outerHTML = `<select id="modalScheduledTime">${timeOptions(modalTimeInput.value)}</select>`;
    const fulfillmentSelect = document.getElementById('modalFulfillment');
    if (fulfillmentSelect) {
        const selected = fulfillmentSelect.value;
        fulfillmentSelect.outerHTML = `<fieldset class="choice-group"><legend>Delivery or pick-up</legend><label class="choice"><input type="radio" name="modalFulfillment" value="delivery" ${selected === 'delivery' ? 'checked' : ''}> Delivery</label><label class="choice"><input type="radio" name="modalFulfillment" value="pickup" ${selected === 'pickup' ? 'checked' : ''}> Pick-up</label></fieldset>`;
    }
    const receiptTotals = document.querySelector('.receipt-totals');
    if (receiptTotals) {
        const rows = [...receiptTotals.children];
        const findRow = (label) => rows.find((row) => row.firstElementChild?.textContent.trim() === label);
        const receivedRow = findRow('RECEIVED');
        if (receivedRow && (modalOrderId || confirmationOrderId)) {
            const order = db.orders.find((item) => item.id === (modalOrderId || confirmationOrderId));
            if (order) receivedRow.lastElementChild.textContent = peso(orderTendered(order));
        }
        const changeRow = document.querySelector('.receipt-change');
        if (changeRow) receiptTotals.append(changeRow);
        [findRow('TOTAL'), findRow('BALANCE'), findRow('RECEIVED'), changeRow].filter(Boolean).forEach((row) => receiptTotals.append(row));
    }
    document.querySelectorAll('[data-action="shareReportSummary"]').forEach((button) => { button.textContent = 'Export Information'; });
}

async function shareOrder(orderId) {
    const order = db.orders.find((item) => item.id === Number(orderId));
    if (!order) return;
    const subtotal = Number(order.total || 0) - Number(order.deliveryFee || 0);
    const balance = Math.max(0, order.total - order.amountReceived);
    const change = orderChange(order);
    const paymentLabel = paymentMethodsLabel(order);
    const totals = [
        ['SUBTOTAL', peso(subtotal)],
        ...(order.deliveryFee ? [['DELIVERY FEE', peso(order.deliveryFee)]] : []),
        ['TOTAL', peso(order.total)],
        ['RECEIVED', peso(orderTendered(order))],
        ['BALANCE', peso(balance)],
        ...(change ? [['CHANGE', peso(change)]] : []),
        ...(paymentLabel ? [['PAYMENT', paymentLabel]] : []),
    ];
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 420 + order.items.length * 44 + totals.length * 38;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const logo = new Image();
    logo.src = './droolys-logo.jpg';
    await new Promise((resolve) => { logo.onload = resolve; logo.onerror = resolve; });
    if (logo.complete && logo.naturalWidth) context.drawImage(logo, 70, 56, 96, 96);
    context.fillStyle = '#17211f';
    context.font = 'bold 34px Lato, Arial, sans-serif';
    context.fillText("DROOLY'S", 190, 92);
    context.font = '22px Lato, Arial, sans-serif';
    context.fillStyle = '#6c665d';
    context.textAlign = 'right';
    context.fillText(order.receipt, 930, 92);
    context.fillText(`${order.scheduledDate} ${formatTime(order.scheduledTime)}`, 930, 124);
    context.font = 'bold 20px Lato, Arial, sans-serif';
    context.fillText(order.fulfillment === 'pickup' ? 'PICK-UP' : 'DELIVERY', 930, 154);
    context.textAlign = 'left';
    context.strokeStyle = '#9d958a';
    context.setLineDash([10, 8]);
    context.beginPath();
    context.moveTo(70, 188);
    context.lineTo(930, 188);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = '#17211f';
    context.font = 'bold 26px Lato, Arial, sans-serif';
    context.fillText(order.customer.name || 'No customer name', 70, 232);
    context.textAlign = 'right';
    context.font = 'bold 20px Lato, Arial, sans-serif';
    context.fillText(order.status.toUpperCase(), 930, 232);
    context.textAlign = 'left';
    context.font = '22px Lato, Arial, sans-serif';
    context.fillStyle = '#6c665d';
    if (order.customer.contact) context.fillText(order.customer.contact, 70, 264);
    let y = 320;
    context.fillStyle = '#6c665d';
    context.font = 'bold 20px Lato, Arial, sans-serif';
    context.fillText('ITEM', 70, y);
    context.fillText('QTY', 650, y);
    context.fillText('AMOUNT', 770, y);
    y += 36;
    context.fillStyle = '#17211f';
    context.font = '22px Lato, Arial, sans-serif';
    order.items.forEach((item) => {
        context.fillText(item.name, 70, y);
        context.fillText(String(item.qty), 650, y);
        context.textAlign = 'right';
        context.fillText(peso(item.price * item.qty), 930, y);
        context.textAlign = 'left';
        y += 44;
    });
    y += 18;
    context.strokeStyle = '#9d958a';
    context.beginPath();
    context.moveTo(560, y);
    context.lineTo(930, y);
    context.stroke();
    y += 40;
    totals.forEach(([label, value]) => {
        context.font = label === 'TOTAL' ? 'bold 22px Lato, Arial, sans-serif' : '22px Lato, Arial, sans-serif';
        context.fillStyle = '#17211f';
        context.fillText(label, 560, y);
        context.textAlign = 'right';
        context.fillText(value, 930, y);
        context.textAlign = 'left';
        y += 38;
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    const file = new File([blob], `${order.receipt}-receipt.jpg`, { type: 'image/jpeg' });
    const text = `${order.receipt} - ${order.customer.name || 'Customer'}\nPayable: ${peso(order.total)}\nReceived: ${peso(orderTendered(order))}\n${paymentMethodsLabel(order)} · ${order.status.toUpperCase()}`;
    if (await shareWithAndroid(file, blob, text)) return;
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) return navigator.share({ title: `Order ${order.receipt}`, text, files: [file] });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function addToCart(id) {
    const product = db.products.find((p) => p.id === Number(id));
    const existing = cart.get(product.id) || { id: product.id, name: product.name, price: product.price, piecesPerUnit: productPiecesPerUnit(product), qty: 0 };
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
    const fulfillment = document.querySelector('input[name="fulfillment"]:checked')?.value || 'delivery';
    const deliveryFee = fulfillment === 'delivery' ? Number(document.getElementById('deliveryFee')?.value || 0) : 0;
    if (deliveryFee < 0) return;
    const total = subtotal + deliveryFee;
    if (!confirm(`Create this ${fulfillment === 'delivery' ? 'delivery' : 'pick-up'} order for ${peso(total)}?`)) return;
    const tenderedAmount = Number(document.getElementById('amountReceived')?.value || 0);
    const amountReceived = Math.min(Math.max(0, tenderedAmount), total);
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'cash';
    const createdAt = new Date().toISOString();
    db.orders.push({
        id: Date.now(),
        receipt: nextReceiptNumber(),
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
        tenderedAmount,
        payments: amountReceived > 0 ? [{ method: paymentMethod, amount: amountReceived, paidAt: createdAt }] : [],
        paidAt: amountReceived >= total ? createdAt : '',
        change: Math.max(0, tenderedAmount - total),
        status: amountReceived >= total ? 'paid' : 'partial',
        createdAt,
    });
    confirmationOrderId = db.orders[db.orders.length - 1].id;
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
    if (target.dataset.action === 'closeConfirmation') {
        confirmationOrderId = null;
        render();
    }
    if (target.dataset.action === 'shareOrder') shareOrder(target.dataset.orderId).catch(() => alert('Unable to share this order.'));
    if (target.dataset.action === 'shareTodayOrders') shareTodayOrders().catch(() => { syncStatus = 'Unable to share today\'s orders. Check the Wi-Fi connection.'; render(); });
    if (target.dataset.action === 'shareLocalDashboard') shareLocalDashboard().catch(() => { syncStatus = 'Unable to start local access. Check the Wi-Fi connection.'; render(); });
    if (target.dataset.action === 'stopLocalDashboard') stopLocalDashboard().catch(() => { syncStatus = 'Unable to stop local access.'; render(); });
    if (target.dataset.action === 'receiveTodayOrders') receiveTodayOrders().catch((error) => { syncStatus = error.message || 'Unable to receive orders. Check the Admin IP and Wi-Fi.'; render(); });
    if (target.dataset.action === 'sendRiderUpdates') sendRiderUpdates().catch((error) => { syncStatus = error.message || 'Unable to send Rider updates. Check the Admin IP and Wi-Fi.'; render(); });
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
    if (target.dataset.action === 'clearArchivedDate') {
        archivedDateFilter = '';
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
        tab = 'dashboard';
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
        order.fulfillment = document.querySelector('input[name="modalFulfillment"]:checked')?.value || 'delivery';
        order.scheduledTime = document.getElementById('modalScheduledTime').value;
        order.customer.name = document.getElementById('modalCustomerName').value.trim();
        order.customer.contact = document.getElementById('modalCustomerContact').value.trim();
        order.customer.address = document.getElementById('modalCustomerAddress').value.trim();
        const itemRows = [...document.querySelectorAll('.modal-order-item')];
        order.items = itemRows.map((row) => {
                const product = db.products.find((item) => item.id === Number(row.querySelector('.modal-item-product').value));
                return { id: product.id, name: product.name, price: Number(product.price), qty: Number(row.querySelector('.modal-item-quantity').value || 0), piecesPerUnit: productPiecesPerUnit(product) };
            }).filter((item) => item.qty > 0);
        order.deliveryFee = order.fulfillment === 'delivery' ? Number(document.getElementById('modalDeliveryFee')?.value || 0) : 0;
        order.total = order.items.reduce((sum, item) => sum + item.price * item.qty, 0) + order.deliveryFee;
        reconcileOrderAfterTotalChange(order);
        persist();
        render();
    }
    if (target.dataset.action === 'updatePayment') {
        const order = db.orders.find((item) => item.id === Number(target.dataset.orderId));
        const additionalPayment = Number(document.getElementById('modalAmountReceived').value || 0);
        const paymentMethod = document.querySelector('input[name="modalPaymentMethod"]:checked')?.value || 'cash';
        if (!order || additionalPayment <= 0) return;
        const currentReceived = Math.min(Number(order.total || 0), Math.max(0, Number(order.amountReceived || 0)));
        const remainingBalance = Math.max(0, Number(order.total || 0) - currentReceived);
        const creditedPayment = Math.min(additionalPayment, remainingBalance);
        const change = Math.max(0, additionalPayment - creditedPayment);
        if (!creditedPayment) return;
        if (!confirm(`Save payment of ${peso(creditedPayment)}${change ? ` and return ${peso(change)} change` : ''}?`)) return;
        order.payments = Array.isArray(order.payments) ? order.payments : (order.amountReceived > 0 ? [{ method: order.paymentMethod || 'cash', amount: Number(order.amountReceived) }] : []);
        order.payments.push({ method: paymentMethod, amount: creditedPayment, paidAt: new Date().toISOString() });
        order.amountReceived = currentReceived + creditedPayment;
        order.tenderedAmount = orderTendered(order) + additionalPayment;
        order.paymentMethod = paymentMethod;
        order.change = Math.max(0, order.tenderedAmount - order.amountReceived);
        order.status = order.amountReceived >= order.total ? 'paid' : 'partial';
        if (order.status === 'paid') order.paidAt = new Date().toISOString();
        persist();
        render();
        sendRiderUpdatesAfterPayment();
    }
    if (target.dataset.action === 'updateOrderItems') {
        if (user.role === 'rider') return;
        const order = db.orders.find((item) => item.id === Number(target.dataset.orderId));
        const deliveryFee = Number(document.getElementById('modalDeliveryFee')?.value || 0);
        if (!order || deliveryFee < 0 || !confirm('Save item quantities and delivery fee?')) return;
        order.deliveryFee = order.fulfillment === 'delivery' ? deliveryFee : 0;
        order.total = order.items.reduce((sum, item) => sum + item.price * item.qty, 0) + order.deliveryFee;
        reconcileOrderAfterTotalChange(order);
        persist();
        render();
    }
    if (target.dataset.action === 'markDelivered' || target.dataset.action === 'markPickedUp') {
        const order = db.orders.find((item) => item.id === modalOrderId);
        if (!order || Number(order.amountReceived || 0) < Number(order.total || 0)) return;
        if (!confirm(target.dataset.action === 'markPickedUp' ? 'Confirm this pickup order was collected?' : 'Mark this order as delivered?')) return;
        order.status = 'delivered';
        order.deliveredAt = new Date().toISOString();
        persist();
        modalOrderId = null;
        tab = user.role === 'rider' ? 'preorders' : 'archived';
        render();
    }
    if (target.dataset.action === 'markBaked') {
        if (user.role === 'rider') return;
        const order = db.orders.find((item) => item.id === Number(target.dataset.orderId));
        if (!order || order.bakedAt) return;
        if (!confirm(`Mark ${order.receipt} as baked? Its items will be removed from the remaining item count.`)) return;
        order.bakedAt = new Date().toISOString();
        persist();
        render();
    }
    if (target.dataset.action === 'checkout') checkout();
    if (target.dataset.action === 'deleteArchivedOrder' || target.dataset.action === 'deleteOrder') {
        if (user.role === 'rider') return;
        const orderId = Number(target.dataset.orderId);
        const order = db.orders.find((item) => item.id === orderId);
        const needsPassword = target.dataset.action === 'deleteArchivedOrder' || order?.status === 'delivered';
        if (needsPassword) {
            if (!confirmOrderDeletion({ archived: true })) return;
        } else if (!confirm('Delete this order permanently?')) return;
        db.orders = db.orders.filter((item) => item.id !== orderId);
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
        product.piecesPerUnit = productPiecesPerUnit({ piecesPerUnit: document.getElementById('pPiecesPerUnit').value });
        if (!Array.isArray(db.categories)) db.categories = [];
        if (product.category && !db.categories.includes(product.category)) db.categories.push(product.category);
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
        document.getElementById('pPiecesPerUnit').value = productPiecesPerUnit(product);
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
    if (event.target.name === 'fulfillment') {
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
    if (event.target.id === 'archivedDate') {
        archivedDateFilter = event.target.value;
        render();
    }
    if (event.target.id === 'posCategoryFilter') {
        posCategoryFilter = event.target.value;
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

if (!remoteMode && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

render();
