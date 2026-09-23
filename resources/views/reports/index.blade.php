<x-app-layout>
    <div class="page-title"><div><h1>Reports</h1><p>Daily and monthly sales, costs, and net income.</p></div><button onclick="window.print()" class="primary-action">Print / PDF</button></div>
    <form class="filter-bar" method="GET"><label>From <input type="date" name="from" value="{{ $from }}"></label><label>To <input type="date" name="to" value="{{ $to }}"></label><button>Filter</button></form>
    <section class="metric-grid">
        <div class="metric"><span>Total Sales</span><strong>PHP {{ number_format($totalSales, 2) }}</strong></div>
        <div class="metric"><span>Total Cost</span><strong>PHP {{ number_format($totalCost, 2) }}</strong></div>
        <div class="metric"><span>Net Income</span><strong>PHP {{ number_format($netIncome, 2) }}</strong></div>
    </section>
    <section class="panel">
        <h2>Transactions</h2>
        <table><thead><tr><th>Receipt</th><th>Date</th><th>User</th><th>Mode</th><th>Sales</th><th>Cost</th><th>Profit</th></tr></thead><tbody>
            @foreach($orders as $order)
                <tr><td><a href="{{ route('receipts.show', $order) }}">{{ $order->receipt_no }}</a></td><td>{{ $order->created_at->format('M d, Y h:i A') }}</td><td>{{ $order->user?->name }}</td><td>{{ ucfirst($order->mode) }}</td><td>PHP {{ number_format($order->total, 2) }}</td><td>PHP {{ number_format($order->total_cost, 2) }}</td><td>PHP {{ number_format($order->total - $order->total_cost, 2) }}</td></tr>
            @endforeach
        </tbody></table>
    </section>
</x-app-layout>
