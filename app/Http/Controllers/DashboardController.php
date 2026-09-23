<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use Illuminate\Support\Carbon;
use Illuminate\View\View;

class DashboardController extends Controller
{
    public function __invoke(): View
    {
        $today = Carbon::today();
        $monthStart = Carbon::now()->startOfMonth();

        return view('dashboard', [
            'todaySales' => Order::whereDate('created_at', $today)->sum('total'),
            'monthSales' => Order::where('created_at', '>=', $monthStart)->sum('total'),
            'todayProfit' => Order::whereDate('created_at', $today)->selectRaw('COALESCE(SUM(total - total_cost),0) as profit')->value('profit'),
            'lowStock' => Product::whereColumn('stock', '<=', 'low_stock_threshold')->orderBy('stock')->get(),
            'preorders' => Order::where('mode', 'preorder')->whereDate('scheduled_date', '>=', $today)->orderBy('scheduled_date')->limit(8)->get(),
        ]);
    }
}
