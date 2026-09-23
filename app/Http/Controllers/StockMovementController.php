<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class StockMovementController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'type' => ['required', 'in:in,out'],
            'quantity' => ['required', 'integer', 'min:1'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $product = Product::findOrFail($data['product_id']);
        if ($data['type'] === 'out' && $product->stock < $data['quantity']) {
            return back()->withErrors(['quantity' => 'Stock out is greater than available stock.']);
        }

        $data['user_id'] = $request->user()->id;
        StockMovement::create($data);
        $data['type'] === 'in'
            ? $product->increment('stock', $data['quantity'])
            : $product->decrement('stock', $data['quantity']);

        return back()->with('status', 'Stock movement saved.');
    }
}
