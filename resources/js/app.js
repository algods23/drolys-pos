import './bootstrap';

import Alpine from 'alpinejs';

window.Alpine = Alpine;

Alpine.start();

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

if (window.DROOLYS_POS) {
    const cart = new Map();
    let mode = 'direct';
    const cartItems = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    const changeEl = document.getElementById('changeDue');
    const cashEl = document.getElementById('cashReceived');
    const messageEl = document.getElementById('posMessage');
    const scheduleWrap = document.getElementById('scheduleWrap');
    const scheduledDate = document.getElementById('scheduledDate');

    const total = () => [...cart.values()].reduce((sum, item) => sum + item.price * item.quantity, 0);

    const render = () => {
        cartItems.innerHTML = '';
        if (!cart.size) {
            cartItems.innerHTML = '<p>No items yet.</p>';
        }
        cart.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'cart-row';
            row.innerHTML = `
                <div><strong>${item.name}</strong><br><small>${money(item.price)} each</small></div>
                <div class="qty-controls">
                    <button type="button" data-dec="${item.id}">-</button>
                    <strong>${item.quantity}</strong>
                    <button type="button" data-inc="${item.id}">+</button>
                </div>`;
            cartItems.appendChild(row);
        });
        totalEl.textContent = money(total());
        changeEl.textContent = money(Number(cashEl.value || 0) - total());
    };

    document.querySelectorAll('.product-tile').forEach((button) => {
        button.addEventListener('click', () => {
            const id = button.dataset.id;
            const current = cart.get(id) || {
                id,
                name: button.dataset.name,
                price: Number(button.dataset.price),
                stock: Number(button.dataset.stock),
                quantity: 0,
            };
            if (current.quantity < current.stock) {
                current.quantity += 1;
                cart.set(id, current);
                messageEl.textContent = '';
            } else {
                messageEl.textContent = `${current.name} has no more available stock.`;
            }
            render();
        });
    });

    cartItems.addEventListener('click', (event) => {
        const inc = event.target.dataset.inc;
        const dec = event.target.dataset.dec;
        const id = inc || dec;
        if (!id) return;
        const item = cart.get(id);
        item.quantity += inc ? 1 : -1;
        if (item.quantity <= 0) cart.delete(id);
        if (item.quantity > item.stock) item.quantity = item.stock;
        render();
    });

    document.querySelectorAll('.mode-toggle button').forEach((button) => {
        button.addEventListener('click', () => {
            mode = button.dataset.mode;
            document.querySelectorAll('.mode-toggle button').forEach((b) => b.classList.remove('active'));
            button.classList.add('active');
            scheduleWrap.classList.toggle('hidden', mode !== 'preorder');
        });
    });

    cashEl.addEventListener('input', render);
    render();

    document.getElementById('checkoutBtn').addEventListener('click', async () => {
        messageEl.textContent = '';
        if (!cart.size) {
            messageEl.textContent = 'Add at least one item.';
            return;
        }
        const payload = {
            mode,
            scheduled_date: mode === 'preorder' ? scheduledDate.value : null,
            cash_received: Number(cashEl.value || 0),
            items: [...cart.values()].map((item) => ({ product_id: item.id, quantity: item.quantity })),
        };
        try {
            const response = await fetch(window.DROOLYS_POS.checkoutUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': window.DROOLYS_POS.csrf,
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Checkout failed.');
            window.location.href = `${window.DROOLYS_POS.receiptBase}/${data.order.id}`;
        } catch (error) {
            messageEl.textContent = error.message;
        }
    });
}
