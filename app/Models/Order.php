<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    protected $fillable = [
        'receipt_no', 'user_id', 'mode', 'scheduled_date', 'subtotal', 'total_cost',
        'total', 'cash_received', 'change_due', 'status',
    ];

    protected $casts = [
        'scheduled_date' => 'date',
        'subtotal' => 'decimal:2',
        'total_cost' => 'decimal:2',
        'total' => 'decimal:2',
        'cash_received' => 'decimal:2',
        'change_due' => 'decimal:2',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }
}
