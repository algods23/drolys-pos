<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\View\View;

class SystemController extends Controller
{
    public function index(): View
    {
        File::ensureDirectoryExists(storage_path('app/backups'));

        return view('system.index', [
            'backups' => collect(File::files(storage_path('app/backups')))->sortByDesc->getMTime(),
        ]);
    }

    public function backup(): RedirectResponse
    {
        File::ensureDirectoryExists(storage_path('app/backups'));
        $name = 'droolys-backup-' . now()->format('Ymd-His') . '.sqlite';
        $path = storage_path('app/backups/' . $name);
        $database = database_path('database.sqlite');

        if (! File::exists($database)) {
            return back()->with('error', 'Database file does not exist yet.');
        }

        File::copy($database, $path);

        return back()->with('status', "Backup created: {$name}");
    }

    public function restore(Request $request): RedirectResponse
    {
        $data = $request->validate(['backup' => ['required', 'string']]);
        $path = storage_path('app/backups/' . basename($data['backup']));
        abort_unless(File::exists($path), 404);
        File::copy($path, database_path('database.sqlite'));

        return back()->with('status', 'Database restored.');
    }
}
