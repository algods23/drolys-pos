<x-app-layout>
    <div class="receipt">
        <h1>Drooly's</h1>
        <p>{{ $order->receipt_no }}<br>{{ $order->created_at->format('M d, Y h:i A') }}<br>{{ ucfirst($order->mode) }} @if($order->scheduled_date) for {{ $order->scheduled_date->format('M d, Y') }} @endif</p>
        <table><tbody>
            @foreach($order->items as $item)
                <tr><td>{{ $item->quantity }} x {{ $item->product_name }}</td><td>PHP {{ number_format($item->line_total, 2) }}</td></tr>
            @endforeach
        </tbody></table>
        <div class="receipt-total"><span>Total</span><strong>PHP {{ number_format($order->total, 2) }}</strong></div>
        <div class="receipt-total"><span>Cash</span><strong>PHP {{ number_format($order->cash_received, 2) }}</strong></div>
        <div class="receipt-total"><span>Change</span><strong>PHP {{ number_format($order->change_due, 2) }}</strong></div>
        <p>Served by {{ $order->user?->name }}</p>
        <button onclick="window.print()">Print Receipt</button>
    </div>
</x-app-layout>
