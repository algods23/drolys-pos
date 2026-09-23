<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

class PosController extends Controller
{
    public function index(): View
    {
        return view('pos.index', [
            'products' => Product::with('category')->where('is_active', true)->orderBy('name')->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'mode' => ['required', 'in:direct,preorder'],
            'scheduled_date' => ['nullable', 'date', 'after_or_equal:today'],
            'cash_received' => ['required', 'numeric', 'min:0'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
        ]);

        if ($data['mode'] === 'preorder' && empty($data['scheduled_date'])) {
            return response()->json(['message' => 'Choose a scheduled date for pre-orders.'], 422);
        }

        $order = DB::transaction(function () use ($data, $request) {
            $ids = collect($data['items'])->pluck('product_id');
            $products = Product::whereIn('id', $ids)->lockForUpdate()->get()->keyBy('id');
            $subtotal = 0;
            $totalCost = 0;

            foreach ($data['items'] as $item) {
                $product = $products[$item['product_id']];
                if ($product->stock < $item['quantity']) {
                    abort(422, "{$product->name} has only {$product->stock} left.");
                }
                $subtotal += $product->price * $item['quantity'];
                $totalCost += $product->cost * $item['quantity'];
            }

            if ($data['cash_received'] < $subtotal) {
                abort(422, 'Cash received is lower than the total.');
            }

            $order = Order::create([
                'receipt_no' => 'DRL-' . now()->format('Ymd-His') . '-' . random_int(100, 999),
                'user_id' => $request->user()->id,
                'mode' => $data['mode'],
                'scheduled_date' => $data['mode'] === 'preorder' ? $data['scheduled_date'] : null,
                'subtotal' => $subtotal,
                'total_cost' => $totalCost,
                'total' => $subtotal,
                'cash_received' => $data['cash_received'],
                'change_due' => $data['cash_received'] - $subtotal,
                'status' => 'completed',
            ]);

            foreach ($data['items'] as $item) {
                $product = $products[$item['product_id']];
                $order->items()->create([
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'quantity' => $item['quantity'],
                    'unit_price' => $product->price,
                    'unit_cost' => $product->cost,
                    'line_total' => $product->price * $item['quantity'],
                ]);
                $product->decrement('stock', $item['quantity']);
                StockMovement::create([
                    'product_id' => $product->id,
                    'user_id' => $request->user()->id,
                    'type' => 'out',
                    'quantity' => $item['quantity'],
                    'reason' => 'Sale ' . $order->receipt_no,
                ]);
            }

            return $order->load('items', 'user');
        });

        return response()->json(['order' => $order]);
    }
}
