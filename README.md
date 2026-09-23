# Drooly's POS and Inventory System

Offline-first Laravel, MySQL, and Electron desktop POS for Drooly's.

## Default Accounts

- Admin: `admin@droolys.local` / `password`
- Cashier: `cashier@droolys.local` / `password`

## Local Setup

1. Copy `.env.example` to `.env` when needed.
2. Run `composer install`.
3. Run `npm install`.
4. Run `php artisan key:generate`.
5. Run `php artisan migrate --seed`.
6. Run `npm run build`.

## Desktop App

Run:

```bash
npm run desktop
```

Electron starts Laravel automatically at `http://127.0.0.1:8001`, opens one desktop window, and prevents duplicate windows. Data is stored locally in `database/database.sqlite`, so MySQL and Laragon are not required.

## Android / Local Network

For Android access on the same Wi-Fi network:

```bash
php artisan serve --host=0.0.0.0 --port=8001
```

Open `http://YOUR-PC-IP:8001` on Android, or point a Capacitor/WebView shell to that URL. Keep the PC and Android device on the same local network.

For a fully stand-alone Android APK, the Laravel/PHP backend must be replaced with a mobile-native local API/storage layer, such as Capacitor plus SQLite. A normal Android WebView cannot run Laravel/PHP by itself.

## Features

- Touch-friendly POS with Direct Buy and Pre-order modes.
- Auto totals, change, receipt, and stock deduction.
- Product inventory, stock in/out, and low stock alerts.
- Pre-order date tracking with required stock by product.
- Daily/monthly reports with sales, cost, and net income.
- Admin and cashier roles.
- Printable receipts and printable/PDF reports through the browser print dialog.
- MySQL backup and restore screen for admin users.
