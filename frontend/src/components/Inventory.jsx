import React, { useState, useEffect } from 'react';
import Adjustments from './Adjustments';

const API_BASE_URL = 'http://localhost:5000/api';

export default function Inventory() {
  const userObj = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = userObj.role === 'super_admin';

  // Tab navigation state
  const [activeTab, setActiveTab] = useState('inventory');

  const [products, setProducts] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [expiryFilter, setExpiryFilter] = useState(false);
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState('');
 
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);
 
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    price: '',
    cost_price: '',
    stock_quantity: '',
    low_stock_threshold: '10',
    expiry_date: '',
    supplier_id: '',
    unit: 'piece'
  });
 
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      let url = `${API_BASE_URL}/products?search=${encodeURIComponent(search)}${
        lowStockFilter ? '&low_stock=true' : ''
      }${
        expiryFilter ? '&expiring=true' : ''
      }`;
      if (isSuperAdmin && selectedShopId) {
        url += `&shop_id=${selectedShopId}`;
      }
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to retrieve inventory.');
      const data = await response.json();
      setProducts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
 
  const fetchSuppliers = async () => {
    if (isSuperAdmin) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/suppliers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setSuppliers(await response.json());
      }
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    }
  };
 
  useEffect(() => {
    setCurrentPage(1);
    fetchProducts();
  }, [search, lowStockFilter, expiryFilter, selectedShopId]);
 
  useEffect(() => {
    fetchSuppliers();
    if (isSuperAdmin) {
      const fetchShops = async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`${API_BASE_URL}/shops`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            setShops(data);
          }
        } catch (err) {
          console.error('Failed to fetch shops:', err);
        }
      };
      fetchShops();
    }
  }, [isSuperAdmin]);

  const triggerAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 1. CREATE PRODUCT
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.sku || !formData.price || !formData.cost_price) {
      triggerAlert('error', 'Please fill in all required fields.');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          cost_price: parseFloat(formData.cost_price),
          stock_quantity: parseInt(formData.stock_quantity || 0),
          low_stock_threshold: parseInt(formData.low_stock_threshold || 10),
          expiry_date: formData.expiry_date || null,
          supplier_id: formData.supplier_id ? parseInt(formData.supplier_id) : null
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to create product.');

      triggerAlert('success', 'Product created successfully!');
      setShowAddModal(false);
      resetForm();
      fetchProducts();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  // 2. OPEN EDIT MODAL
  const openEdit = (product) => {
    setCurrentProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      price: product.price,
      cost_price: product.cost_price,
      stock_quantity: product.stock_quantity,
      low_stock_threshold: product.low_stock_threshold,
      expiry_date: product.expiry_date ? product.expiry_date.split('T')[0] : '',
      supplier_id: product.supplier_id || '',
      unit: product.unit || 'piece'
    });
    setShowEditModal(true);
  };

  // 3. UPDATE PRODUCT
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/products/${currentProduct.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          cost_price: parseFloat(formData.cost_price),
          stock_quantity: parseInt(formData.stock_quantity),
          low_stock_threshold: parseInt(formData.low_stock_threshold),
          expiry_date: formData.expiry_date || null,
          supplier_id: formData.supplier_id ? parseInt(formData.supplier_id) : null
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to update product.');

      triggerAlert('success', 'Product updated successfully!');
      setShowEditModal(false);
      resetForm();
      fetchProducts();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  // 4. DELETE PRODUCT
  const handleDelete = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/products/${productId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to delete product.');

      triggerAlert('success', 'Product deleted successfully!');
      fetchProducts();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      sku: '',
      price: '',
      cost_price: '',
      stock_quantity: '',
      low_stock_threshold: '10',
      expiry_date: '',
      supplier_id: '',
      unit: 'piece'
    });
    setCurrentProduct(null);
  };

  const exportToCSV = () => {
    if (products.length === 0) {
      triggerAlert('error', 'No products to export.');
      return;
    }

    const headers = ['ID', 'Name', 'SKU', 'Cost Price', 'Sale Price', 'Stock Quantity', 'Low Stock Threshold', 'Expiry Date'];
    
    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      let str = String(val);
      if (/[",\n\r]/.test(str)) {
        str = `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = products.map(p => [
      p.id,
      escapeCSV(p.name),
      escapeCSV(p.sku),
      parseFloat(p.cost_price).toFixed(2),
      parseFloat(p.price).toFixed(2),
      p.stock_quantity,
      p.low_stock_threshold,
      p.expiry_date ? p.expiry_date.split('T')[0] : 'N/A'
    ]);

    const csvContent = "\uFEFF" + [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerAlert('success', 'Catalog exported successfully!');
  };
  const totalPages = Math.ceil(products.length / itemsPerPage);
  const indexOfLastProduct = currentPage * itemsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - itemsPerPage;
  const currentProducts = products.slice(indexOfFirstProduct, indexOfLastProduct);

  return (
    <div className="space-y-6">
      
      {/* Alerts Banner */}
      {alert && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center transition-all ${
          alert.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          <span className="text-sm font-semibold">{alert.message}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'inventory'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Inventory Catalog
        </button>
        <button
          onClick={() => setActiveTab('adjustments')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'adjustments'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Adjustments
        </button>
      </div>

      {/* Inventory Tab Content */}
      {activeTab === 'inventory' && (
        <>
          {/* Title Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Inventory Catalog</h2>
              <p className="text-sm text-slate-500">Manage shop items, monitor levels, and set restock alerts</p>
            </div>
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <button
                onClick={exportToCSV}
                className="bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-5 border border-slate-200 rounded-xl text-sm shadow-xs transition-colors flex items-center space-x-2"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Export Catalog</span>
              </button>
            </div>
          </div>
 
      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <svg className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
 
        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-4 md:gap-6">
          {isSuperAdmin && (
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-655 mr-2">
              <span className="text-slate-500">Tenant Shop:</span>
              <select
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                className="border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-700 font-medium"
              >
                <option value="">All Shops (Consolidated)</option>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Low Stock Checkbox Filter */}
          <label className="flex items-center space-x-2.5 cursor-pointer text-sm font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={lowStockFilter}
              onChange={(e) => setLowStockFilter(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Show Low Stock Warnings Only</span>
          </label>
 
          {/* Expiry Checkbox Filter */}
          <label className="flex items-center space-x-2.5 cursor-pointer text-sm font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={expiryFilter}
              onChange={(e) => setExpiryFilter(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Show Expired / Expiring Soon Only</span>
          </label>
        </div>
      </div>
 
      {/* Dynamic Graph Chart */}
      {(() => {
        // Take the top 7 products by stock quantity to display in the bar chart
        const topProducts = [...products]
          .sort((a, b) => b.stock_quantity - a.stock_quantity)
          .slice(0, 7);

        const maxVal = Math.max(...topProducts.map(p => p.stock_quantity), 10);

        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs relative">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Stock Levels distribution</h3>
              <p className="text-xs text-slate-500">Visualization of the top products by currently available stock quantities</p>
            </div>

            {topProducts.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-slate-400 text-sm">
                No inventory items to display.
              </div>
            ) : (
              <div className="relative w-full h-[180px] mt-4">
                {/* SVG Plot */}
                <svg 
                  viewBox="0 0 600 180" 
                  className="w-full h-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  {/* Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                    const y = 15 + (1 - ratio) * 120;
                    const labelVal = ratio * maxVal;
                    return (
                      <g key={idx}>
                        <line 
                          x1={60} 
                          y1={y} 
                          x2={580} 
                          y2={y} 
                          stroke="#f1f5f9" 
                          strokeWidth="1.5"
                        />
                        <text 
                          x={48} 
                          y={y + 4} 
                          textAnchor="end" 
                          className="text-[10px] font-bold text-slate-400 fill-current font-sans"
                        >
                          {Math.round(labelVal)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Bars */}
                  {(() => {
                    const chartWidth = 600;
                    const chartHeight = 180;
                    const paddingLeft = 60;
                    const paddingRight = 20;
                    const barWidth = 35;
                    const availableWidth = chartWidth - paddingLeft - paddingRight;
                    const colWidth = availableWidth / topProducts.length;

                    return topProducts.map((prod, idx) => {
                      const val = prod.stock_quantity;
                      const x = paddingLeft + (idx * colWidth) + (colWidth - barWidth) / 2;
                      const y = 135 - ((val / maxVal) * 120);
                      const height = 135 - y;

                      return (
                        <g key={prod.id}>
                          {/* Interactive Bar Hover Catcher */}
                          <rect
                            x={paddingLeft + (idx * colWidth)}
                            y={15}
                            width={colWidth}
                            height={120}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredPoint({ ...prod, x: x + barWidth / 2, y, val })}
                            onMouseLeave={() => setHoveredPoint(null)}
                          />
                          {/* Styled Visual Bar */}
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={height}
                            rx="4"
                            fill={hoveredPoint?.id === prod.id ? "#4f46e5" : "#818cf8"}
                            className="transition-all duration-150 pointer-events-none"
                          />
                          {/* Shortened Label */}
                          <text
                            x={x + barWidth / 2}
                            y={155}
                            textAnchor="middle"
                            className="text-[10px] font-bold text-slate-400 fill-current font-sans"
                          >
                            {prod.name.length > 10 ? `${prod.name.slice(0, 8)}..` : prod.name}
                          </text>
                        </g>
                      );
                    });
                  })()}
                </svg>

                {/* Tooltip */}
                {hoveredPoint && (
                  <div
                    className="absolute bg-slate-900/95 backdrop-blur-md text-white rounded-xl p-2.5 shadow-xl border border-slate-700 pointer-events-none text-xs flex flex-col space-y-0.5 transition-all duration-75 z-10"
                    style={{
                      left: `${(hoveredPoint.x / 600) * 100}%`,
                      top: `${(hoveredPoint.y / 180) * 100 - 5}%`,
                      transform: 'translate(-50%, -100%)'
                    }}
                  >
                    <span className="font-semibold text-slate-200">
                      {hoveredPoint.name}
                    </span>
                    <span className="font-semibold text-slate-400">
                      SKU: {hoveredPoint.sku}
                    </span>
                    <span className="font-extrabold text-white text-sm">
                      Stock: {hoveredPoint.val} units
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Inventory Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                <th className="p-4">SKU</th>
                {isSuperAdmin && <th className="p-4">Shop</th>}
                <th className="p-4">Product Name</th>
                <th className="p-4">Supplier</th>
                <th className="p-4">Cost Price</th>
                <th className="p-4">Sale Price</th>
                <th className="p-4">Stock</th>
                <th className="p-4">Expiry</th>
                {!isSuperAdmin && <th className="p-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
                    </div>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    No products matched current search filters.
                  </td>
                </tr>
              ) : (
                currentProducts.map((product) => {
                  const isLowStock = product.stock_quantity <= product.low_stock_threshold;
                  
                  // Expiry status calculation
                  let expiryBadge = null;
                  if (product.expiry_date) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const expiry = new Date(product.expiry_date);
                    expiry.setHours(0, 0, 0, 0);
                    const isExpired = expiry.getTime() < today.getTime();
                    const diffTime = expiry.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (isExpired) {
                      expiryBadge = (
                        <span className="bg-rose-50 text-rose-600 border border-rose-100 px-2.5 py-0.5 rounded text-xs font-bold inline-flex items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5 animate-pulse"></span>
                          Expired ({expiry.toLocaleDateString()})
                        </span>
                      );
                    } else if (diffDays <= 30) {
                      expiryBadge = (
                        <span className="bg-amber-50 text-amber-600 border border-amber-100 px-2.5 py-0.5 rounded text-xs font-bold inline-flex items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-ping"></span>
                          Expiring in {diffDays}d ({expiry.toLocaleDateString()})
                        </span>
                      );
                    } else {
                      expiryBadge = (
                        <span className="bg-slate-50 text-slate-655 border border-slate-200 px-2.5 py-0.5 rounded text-xs font-semibold">
                          {expiry.toLocaleDateString()}
                        </span>
                      );
                    }
                  } else {
                    expiryBadge = <span className="text-slate-400 text-xs">N/A</span>;
                  }
 
                  return (
                    <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-mono text-xs font-bold text-slate-500">{product.sku}</td>
                      {isSuperAdmin && <td className="p-4 font-semibold text-slate-800">{product.shop_name}</td>}
                      <td className="p-4 font-semibold text-slate-800">{product.name}</td>
                      <td className="p-4 text-slate-700 font-medium">{product.supplier_name || 'N/A'}</td>
                      <td className="p-4 text-slate-600">৳{parseFloat(product.cost_price).toFixed(2)}</td>
                      <td className="p-4 font-extrabold text-slate-800">৳{parseFloat(product.price).toFixed(2)}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                          isLowStock
                            ? 'bg-rose-50 text-rose-600 border border-rose-100'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}>
                          {product.stock_quantity} {product.unit || 'piece'} / Threshold: {product.low_stock_threshold}
                        </span>
                      </td>
                      <td className="p-4">{expiryBadge}</td>
                      {!isSuperAdmin && (
                        <td className="p-4 text-center space-x-2">
                          <button
                            onClick={() => openEdit(product)}
                            className="text-indigo-600 hover:text-indigo-900 font-semibold text-xs border border-indigo-100 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="text-rose-600 hover:text-rose-900 font-semibold text-xs border border-rose-100 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">
            Showing <span className="text-slate-800">{indexOfFirstProduct + 1}</span> to <span className="text-slate-800">{Math.min(indexOfLastProduct, products.length)}</span> of <span className="text-slate-800">{products.length}</span> entries
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 bg-white hover:bg-slate-50 disabled:hover:bg-white disabled:opacity-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-9 h-9 rounded-xl text-xs font-bold transition-all ${
                  currentPage === page
                    ? 'bg-slate-600 text-white shadow-xs'
                    : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 bg-white hover:bg-slate-50 disabled:hover:bg-white disabled:opacity-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* --- ADD NEW PRODUCT MODAL --- */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Add New Product</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleAddSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Product Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. Wireless Mouse X"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">SKU / Code *</label>
                <input
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. MS-WRL-01"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cost Price (৳) *</label>
                  <input
                    type="number"
                    step="0.01"
                    name="cost_price"
                    value={formData.cost_price}
                    onChange={handleInputChange}
                    required
                    placeholder="25.00"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Sale Price (৳) *</label>
                  <input
                    type="number"
                    step="0.01"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    required
                    placeholder="49.99"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Quantity</label>
                  <input
                    type="number"
                    name="stock_quantity"
                    value={formData.stock_quantity}
                    onChange={handleInputChange}
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Unit *</label>
                  <select
                    name="unit"
                    value={formData.unit}
                    onChange={handleInputChange}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none bg-white font-medium"
                  >
                    <option value="piece">Piece</option>
                    <option value="kg">kg</option>
                    <option value="gm">gm</option>
                    <option value="liter">Liter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Low Stock ({formData.unit || 'piece'})</label>
                  <input
                    type="number"
                    name="low_stock_threshold"
                    value={formData.low_stock_threshold}
                    onChange={handleInputChange}
                    placeholder="10"
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Supplier (Optional)</label>
                <select
                  name="supplier_id"
                  value={formData.supplier_id}
                  onChange={handleInputChange}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none bg-white mb-4"
                >
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Expiry Date (Optional)</label>
                <input
                  type="date"
                  name="expiry_date"
                  value={formData.expiry_date}
                  onChange={handleInputChange}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex space-x-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow"
                >
                  Create Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT PRODUCT MODAL --- */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Edit Product: {currentProduct?.name}</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Product Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">SKU / Code *</label>
                <input
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleInputChange}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cost Price (৳) *</label>
                  <input
                    type="number"
                    step="0.01"
                    name="cost_price"
                    value={formData.cost_price}
                    onChange={handleInputChange}
                    required
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Sale Price (৳) *</label>
                  <input
                    type="number"
                    step="0.01"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    required
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Quantity</label>
                  <input
                    type="number"
                    name="stock_quantity"
                    value={formData.stock_quantity}
                    onChange={handleInputChange}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Unit *</label>
                  <select
                    name="unit"
                    value={formData.unit}
                    onChange={handleInputChange}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none bg-white font-medium"
                  >
                    <option value="piece">Piece</option>
                    <option value="kg">kg</option>
                    <option value="gm">gm</option>
                    <option value="liter">Liter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Low Stock ({formData.unit || 'piece'})</label>
                  <input
                    type="number"
                    name="low_stock_threshold"
                    value={formData.low_stock_threshold}
                    onChange={handleInputChange}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Supplier (Optional)</label>
                <select
                  name="supplier_id"
                  value={formData.supplier_id}
                  onChange={handleInputChange}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none bg-white mb-4"
                >
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Expiry Date (Optional)</label>
                <input
                  type="date"
                  name="expiry_date"
                  value={formData.expiry_date}
                  onChange={handleInputChange}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex space-x-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>
      )}

      {/* Adjustments Tab Content */}
      {activeTab === 'adjustments' && (
        <Adjustments />
      )}

    </div>
  );
}
