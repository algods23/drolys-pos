<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    protected $fillable = ['product_id', 'user_id', 'type', 'quantity', 'reason'];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
