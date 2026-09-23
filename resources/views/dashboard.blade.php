<x-app-layout>
    <div class="page-title">
        <div>
            <h1>Dashboard</h1>
            <p>Offline local sales, stock, and pre-order overview.</p>
        </div>
        <a class="primary-action" href="{{ route('pos.index') }}">Open POS</a>
    </div>

    <section class="metric-grid">
        <div class="metric"><span>Today Sales</span><strong>PHP {{ number_format($todaySales, 2) }}</strong></div>
        <div class="metric"><span>This Month</span><strong>PHP {{ number_format($monthSales, 2) }}</strong></div>
        <div class="metric"><span>Today Profit</span><strong>PHP {{ number_format($todayProfit, 2) }}</strong></div>
        <div class="metric"><span>Low Stock Items</span><strong>{{ $lowStock->count() }}</strong></div>
    </section>

    <div class="two-column">
        <section class="panel">
            <h2>Low Stock</h2>
            <table>
                <thead><tr><th>Product</th><th>Stock</th><th>Alert</th></tr></thead>
                <tbody>
                    @forelse($lowStock as $product)
                        <tr><td>{{ $product->name }}</td><td>{{ $product->stock }}</td><td>{{ $product->low_stock_threshold }}</td></tr>
                    @empty
                        <tr><td colspan="3">All products are above alert levels.</td></tr>
                    @endforelse
                </tbody>
            </table>
        </section>
        <section class="panel">
            <h2>Upcoming Pre-orders</h2>
            <table>
                <thead><tr><th>Receipt</th><th>Date</th><th>Total</th></tr></thead>
                <tbody>
                    @forelse($preorders as $order)
                        <tr><td>{{ $order->receipt_no }}</td><td>{{ $order->scheduled_date->format('M d, Y') }}</td><td>PHP {{ number_format($order->total, 2) }}</td></tr>
                    @empty
                        <tr><td colspan="3">No upcoming pre-orders.</td></tr>
                    @endforelse
                </tbody>
            </table>
        </section>
    </div>
</x-app-layout>
