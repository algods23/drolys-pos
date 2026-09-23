<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        User::query()->updateOrCreate(['email' => 'admin@droolys.local'], [
            'name' => 'Admin',
            'role' => 'admin',
            'password' => 'password',
        ]);

        User::query()->updateOrCreate(['email' => 'cashier@droolys.local'], [
            'name' => 'Cashier',
            'role' => 'cashier',
            'password' => 'password',
        ]);

        $burgers = Category::query()->firstOrCreate(['name' => 'Burgers']);
        $drinks = Category::query()->firstOrCreate(['name' => 'Drinks']);
        $sides = Category::query()->firstOrCreate(['name' => 'Sides']);

        collect([
            [$burgers->id, 'Classic Burger', 89, 42, 80, 15],
            [$burgers->id, 'Cheese Burger', 105, 52, 70, 15],
            [$burgers->id, 'Double Patty Burger', 145, 78, 45, 10],
            [$sides->id, 'Fries', 55, 24, 120, 25],
            [$sides->id, 'Chicken Nuggets', 75, 36, 90, 20],
            [$drinks->id, 'Iced Tea', 35, 12, 140, 30],
            [$drinks->id, 'Bottled Water', 25, 8, 160, 30],
        ])->each(function (array $row): void {
            Product::query()->updateOrCreate(['name' => $row[1]], [
                'category_id' => $row[0],
                'price' => $row[2],
                'cost' => $row[3],
                'stock' => $row[4],
                'low_stock_threshold' => $row[5],
                'is_active' => true,
            ]);
        });
    }
}
