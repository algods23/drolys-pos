<x-app-layout>
    <div class="page-title"><div><h1>Inventory</h1><p>Manage products, stock levels, and low stock alerts.</p></div></div>

    <section class="panel">
        <h2>Add Product</h2>
        <form class="form-grid" method="POST" action="{{ route('products.store') }}">
            @csrf
            <input name="name" placeholder="Product name" required>
            <select name="category_id"><option value="">No category</option>@foreach($categories as $category)<option value="{{ $category->id }}">{{ $category->name }}</option>@endforeach</select>
            <input name="price" type="number" step="0.01" min="0" placeholder="Price" required>
            <input name="cost" type="number" step="0.01" min="0" placeholder="Cost" required>
            <input name="stock" type="number" min="0" placeholder="Stock" required>
            <input name="low_stock_threshold" type="number" min="0" value="10" required>
            <label class="inline"><input type="checkbox" name="is_active" value="1" checked> Active</label>
            <button>Add</button>
        </form>
    </section>

    <section class="panel">
        <h2>Stock In / Out</h2>
        <form class="form-grid" method="POST" action="{{ route('stock-movements.store') }}">
            @csrf
            <select name="product_id" required>@foreach($products as $product)<option value="{{ $product->id }}">{{ $product->name }} ({{ $product->stock }})</option>@endforeach</select>
            <select name="type"><option value="in">Stock in</option><option value="out">Stock out</option></select>
            <input name="quantity" type="number" min="1" placeholder="Qty" required>
            <input name="reason" placeholder="Reason">
            <button>Save Movement</button>
        </form>
    </section>

    <section class="panel">
        <h2>Products</h2>
        <table>
            <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Cost</th><th>Stock</th><th>Alert</th><th></th></tr></thead>
            <tbody>
                @foreach($products as $product)
                    <tr>
                        <form method="POST" action="{{ route('products.update', $product) }}">
                            @csrf @method('PUT')
                            <td><input name="name" value="{{ $product->name }}"></td>
                            <td><select name="category_id"><option value="">None</option>@foreach($categories as $category)<option value="{{ $category->id }}" @selected($product->category_id === $category->id)>{{ $category->name }}</option>@endforeach</select></td>
                            <td><input name="price" type="number" step="0.01" value="{{ $product->price }}"></td>
                            <td><input name="cost" type="number" step="0.01" value="{{ $product->cost }}"></td>
                            <td><input name="stock" type="number" value="{{ $product->stock }}"></td>
                            <td><input name="low_stock_threshold" type="number" value="{{ $product->low_stock_threshold }}"><input type="hidden" name="is_active" value="0"><label><input type="checkbox" name="is_active" value="1" @checked($product->is_active)> Active</label></td>
                            <td><button>Save</button></td>
                        </form>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </section>
</x-app-layout>
