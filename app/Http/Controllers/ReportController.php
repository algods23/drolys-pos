<?php

namespace App\Http\Controllers;

use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\View\View;

class ReportController extends Controller
{
    public function index(Request $request): View
    {
        $from = $request->date('from')?->startOfDay() ?? now()->startOfDay();
        $to = $request->date('to')?->endOfDay() ?? now()->endOfDay();
        $orders = Order::with('items', 'user')->whereBetween('created_at', [$from, $to])->latest()->get();

        return view('reports.index', [
            'orders' => $orders,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totalSales' => $orders->sum('total'),
            'totalCost' => $orders->sum('total_cost'),
            'netIncome' => $orders->sum(fn ($order) => $order->total - $order->total_cost),
        ]);
    }
}
