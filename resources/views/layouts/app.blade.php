<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        <title>{{ config('app.name', "Drooly's POS") }}</title>

        <!-- Fonts -->
        @vite(['resources/css/app.css', 'resources/js/app.js'])
    </head>
    <body>
        <div class="app-shell">
            <aside class="sidebar">
                <div class="brand">
                    <strong>Drooly's</strong>
                    <span>POS + Inventory</span>
                </div>
                <nav>
                    <a class="{{ request()->routeIs('dashboard') ? 'active' : '' }}" href="{{ route('dashboard') }}">Dashboard</a>
                    <a class="{{ request()->routeIs('pos.*') ? 'active' : '' }}" href="{{ route('pos.index') }}">POS</a>
                    <a class="{{ request()->routeIs('preorders.*') ? 'active' : '' }}" href="{{ route('preorders.index') }}">Pre-orders</a>
                    <a class="{{ request()->routeIs('reports.*') ? 'active' : '' }}" href="{{ route('reports.index') }}">Reports</a>
                    @if(auth()->user()?->isAdmin())
                        <a class="{{ request()->routeIs('inventory.*') ? 'active' : '' }}" href="{{ route('inventory.index') }}">Inventory</a>
                        <a class="{{ request()->routeIs('system.*') ? 'active' : '' }}" href="{{ route('system.index') }}">System</a>
                    @endif
                </nav>
                <form method="POST" action="{{ route('logout') }}">
                    @csrf
                    <button class="logout">Logout {{ auth()->user()->name }}</button>
                </form>
            </aside>
            <main class="content">
                @if(session('status'))
                    <div class="notice">{{ session('status') }}</div>
                @endif
                @if(session('error'))
                    <div class="notice danger">{{ session('error') }}</div>
                @endif
                @if($errors->any())
                    <div class="notice danger">{{ $errors->first() }}</div>
                @endif
                {{ $slot }}
            </main>
        </div>
    </body>
</html>
