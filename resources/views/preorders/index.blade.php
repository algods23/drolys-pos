<x-app-layout>
    <div class="page-title"><div><h1>Pre-order Tracking</h1><p>Plan required stock by scheduled date.</p></div></div>
    <form class="filter-bar" method="GET"><label>Date <input type="date" name="date" value="{{ $date }}"></label><button>View</button></form>
    <div class="two-column">
        <section class="panel">
            <h2>Required Stock for {{ $date }}</h2>
            <table><thead><tr><th>Product</th><th>Required Qty</th></tr></thead><tbody>
                @forelse($requirements as $row)
                    <tr><td>{{ $row->product_name }}</td><td>{{ $row->required_quantity }}</td></tr>
                @empty
                    <tr><td colspan="2">No product requirements for this date.</td></tr>
                @endforelse
            </tbody></table>
        </section>
        <section class="panel">
            <h2>Upcoming Daily Totals</h2>
            <table><thead><tr><th>Date</th><th>Orders</th><th>Total</th></tr></thead><tbody>
                @foreach($dailyTotals as $row)
                    <tr><td>{{ $row->scheduled_date }}</td><td>{{ $row->orders_count }}</td><td>PHP {{ number_format($row->total, 2) }}</td></tr>
                @endforeach
            </tbody></table>
        </section>
    </div>
    <section class="panel">
        <h2>Orders for {{ $date }}</h2>
        <table><thead><tr><th>Receipt</th><th>Cashier</th><th>Items</th><th>Total</th></tr></thead><tbody>
            @foreach($orders as $order)
                <tr><td>{{ $order->receipt_no }}</td><td>{{ $order->user?->name }}</td><td>{{ $order->items->sum('quantity') }}</td><td>PHP {{ number_format($order->total, 2) }}</td></tr>
            @endforeach
        </tbody></table>
    </section>
</x-app-layout>
