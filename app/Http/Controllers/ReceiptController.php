<?php

namespace App\Http\Controllers;

use App\Models\Order;
use Illuminate\View\View;

class ReceiptController extends Controller
{
    public function show(Order $order): View
    {
        return view('receipts.show', ['order' => $order->load('items', 'user')]);
    }
}
