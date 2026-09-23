<?php

namespace App\Http\Controllers;

use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

class PreorderController extends Controller
{
    public function index(Request $request): View
    {
        $date = $request->input('date', now()->addDay()->toDateString());

        return view('preorders.index', [
            'date' => $date,
            'orders' => Order::with('items', 'user')->where('mode', 'preorder')->whereDate('scheduled_date', $date)->latest()->get(),
            'requirements' => DB::table('order_items')
                ->join('orders', 'orders.id', '=', 'order_items.order_id')
                ->where('orders.mode', 'preorder')
                ->whereDate('orders.scheduled_date', $date)
                ->select('order_items.product_name', DB::raw('SUM(order_items.quantity) as required_quantity'))
                ->groupBy('order_items.product_name')
                ->orderBy('order_items.product_name')
                ->get(),
            'dailyTotals' => Order::where('mode', 'preorder')
                ->whereDate('scheduled_date', '>=', now()->toDateString())
                ->select('scheduled_date', DB::raw('COUNT(*) as orders_count'), DB::raw('SUM(total) as total'))
                ->groupBy('scheduled_date')
                ->orderBy('scheduled_date')
                ->limit(14)
                ->get(),
        ]);
    }
}
