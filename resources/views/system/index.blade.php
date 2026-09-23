<x-app-layout>
    <div class="page-title"><div><h1>System</h1><p>Local database backup and restore tools.</p></div></div>
    <section class="panel">
        <h2>Backup</h2>
        <form method="POST" action="{{ route('system.backup') }}">@csrf<button>Create SQL Backup</button></form>
    </section>
    <section class="panel">
        <h2>Restore</h2>
        <form class="form-grid" method="POST" action="{{ route('system.restore') }}">
            @csrf
            <select name="backup" required>
                @foreach($backups as $backup)
                    <option value="{{ $backup->getFilename() }}">{{ $backup->getFilename() }}</option>
                @endforeach
            </select>
            <button>Restore Selected Backup</button>
        </form>
    </section>
</x-app-layout>
