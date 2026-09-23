<x-app-layout>
    <div class="page-title">
        <div><h1>Point of Sale</h1><p>Tap products, adjust quantities, then complete the sale.</p></div>
        <div class="mode-toggle">
            <button type="button" data-mode="direct" class="active">Direct Buy</button>
            <button type="button" data-mode="preorder">Pre-order</button>
        </div>
    </div>

    <div class="pos-layout">
        <section class="product-grid">
            @foreach($products as $product)
                <button class="product-tile" data-id="{{ $product->id }}" data-name="{{ $product->name }}" data-price="{{ $product->price }}" data-stock="{{ $product->stock }}">
                    <strong>{{ $product->name }}</strong>
                    <span>PHP {{ number_format($product->price, 2) }}</span>
                    <small>{{ $product->stock }} in stock</small>
                </button>
            @endforeach
        </section>

        <aside class="cart-panel">
            <h2>Cart</h2>
            <label id="scheduleWrap" class="field hidden">Schedule date <input type="date" id="scheduledDate" min="{{ now()->toDateString() }}"></label>
            <div id="cartItems" class="cart-items"></div>
            <div class="totals">
                <div><span>Total</span><strong id="cartTotal">PHP 0.00</strong></div>
                <label>Cash <input id="cashReceived" type="number" min="0" step="0.01" value="0"></label>
                <div><span>Change</span><strong id="changeDue">PHP 0.00</strong></div>
            </div>
            <button id="checkoutBtn" class="checkout">Complete Sale</button>
            <div id="posMessage" class="pos-message"></div>
        </aside>
    </div>

    <script>
        window.DROOLYS_POS = {
            checkoutUrl: @json(route('pos.orders.store')),
            csrf: @json(csrf_token()),
            receiptBase: @json(url('/receipts')),
        };
    </script>
</x-app-layout>
