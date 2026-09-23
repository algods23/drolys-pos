<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\PosController;
use App\Http\Controllers\PreorderController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ReceiptController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\StockMovementController;
use App\Http\Controllers\SystemController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return auth()->check() ? redirect()->route('dashboard') : redirect()->route('login');
});

Route::middleware('auth')->group(function () {
    Route::get('/dashboard', DashboardController::class)->name('dashboard');
    Route::get('/pos', [PosController::class, 'index'])->name('pos.index');
    Route::post('/pos/orders', [PosController::class, 'store'])->name('pos.orders.store');
    Route::get('/receipts/{order}', [ReceiptController::class, 'show'])->name('receipts.show');
    Route::get('/reports', [ReportController::class, 'index'])->name('reports.index');
    Route::get('/preorders', [PreorderController::class, 'index'])->name('preorders.index');

    Route::middleware('role:admin')->group(function () {
        Route::get('/inventory', [ProductController::class, 'index'])->name('inventory.index');
        Route::post('/inventory/products', [ProductController::class, 'store'])->name('products.store');
        Route::put('/inventory/products/{product}', [ProductController::class, 'update'])->name('products.update');
        Route::post('/inventory/stock-movements', [StockMovementController::class, 'store'])->name('stock-movements.store');
        Route::get('/system', [SystemController::class, 'index'])->name('system.index');
        Route::post('/system/backup', [SystemController::class, 'backup'])->name('system.backup');
        Route::post('/system/restore', [SystemController::class, 'restore'])->name('system.restore');
    });

    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

require __DIR__.'/auth.php';
