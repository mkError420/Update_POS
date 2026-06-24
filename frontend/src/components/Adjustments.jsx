import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:5000/api';

export default function Adjustments() {
  const [adjustments, setAdjustments] = useState([]);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Filters
  const [filterProductId, setFilterProductId] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    product_id: '',
    adjusted_quantity: '',
    reason: '',
    notes: ''
  });

  const fetchAdjustments = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      let url = `${API_BASE_URL}/adjustments`;
      const params = new URLSearchParams();
      
      if (filterProductId) params.append('product_id', filterProductId);
      if (filterType) params.append('adjustment_type', filterType);
      if (filterStartDate) params.append('start_date', filterStartDate);
      if (filterEndDate) params.append('end_date', filterEndDate);
      
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to retrieve adjustments.');
      setAdjustments(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/products`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setProducts(await response.json());
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/adjustments/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setStats(await response.json());
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  useEffect(() => {
    fetchAdjustments();
    fetchProducts();
    fetchStats();
  }, [filterProductId, filterType, filterStartDate, filterEndDate]);

  const triggerAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.product_id || formData.adjusted_quantity === '') {
      triggerAlert('error', 'Please select a product and enter the adjusted quantity.');
      return;
    }
    if (!formData.reason) {
      triggerAlert('error', 'Please provide a reason for the adjustment.');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/adjustments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          product_id: parseInt(formData.product_id),
          adjusted_quantity: parseInt(formData.adjusted_quantity),
          reason: formData.reason,
          notes: formData.notes
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to create adjustment.');

      triggerAlert('success', 'Inventory adjustment recorded successfully!');
      setShowAddModal(false);
      resetForm();
      fetchAdjustments();
      fetchStats();
      fetchProducts();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this adjustment? This will revert the stock quantity.')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/adjustments/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to delete adjustment.');

      triggerAlert('success', 'Adjustment deleted and stock reverted!');
      fetchAdjustments();
      fetchStats();
      fetchProducts();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      product_id: '',
      adjusted_quantity: '',
      reason: '',
      notes: ''
    });
  };

  const openAddModal = (product = null) => {
    if (product) {
      setFormData({
        product_id: String(product.id),
        adjusted_quantity: String(product.stock_quantity),
        reason: '',
        notes: ''
      });
    } else {
      resetForm();
    }
    setShowAddModal(true);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getAdjustmentBadge = (type) => {
    return type === 'increase' 
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : 'bg-rose-100 text-rose-800 border-rose-200';
  };

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

      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Inventory Adjustments</h2>
          <p className="text-sm text-slate-500">Adjust stock quantities to match physical inventory counts</p>
        </div>
        <button
          onClick={() => openAddModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-xl text-sm shadow transition-colors flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>New Adjustment</span>
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Adjustments</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{stats.stats.total_adjustments || 0}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Increases</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.stats.increases || 0}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Decreases</div>
            <div className="text-2xl font-bold text-rose-600 mt-1">{stats.stats.decreases || 0}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Change</div>
            <div className={`text-2xl font-bold mt-1 ${stats.stats.net_change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {stats.stats.net_change >= 0 ? '+' : ''}{stats.stats.net_change || 0}
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={filterProductId}
            onChange={(e) => setFilterProductId(e.target.value)}
            className="border border-slate-200 rounded-lg p-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value="">All Products</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-slate-200 rounded-lg p-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value="">All Types</option>
            <option value="increase">Increase Only</option>
            <option value="decrease">Decrease Only</option>
          </select>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="border border-slate-200 rounded-lg p-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="Start Date"
          />
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="border border-slate-200 rounded-lg p-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="End Date"
          />
          <button
            onClick={() => {
              setFilterProductId('');
              setFilterType('');
              setFilterStartDate('');
              setFilterEndDate('');
            }}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Adjustments Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Previous Qty</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Adjusted Qty</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Difference</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Reason</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Adjusted By</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan="9" className="px-6 py-8 text-center text-slate-500">Loading adjustments...</td>
                </tr>
              ) : adjustments.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-6 py-8 text-center text-slate-500">No adjustments found</td>
                </tr>
              ) : (
                adjustments.map(adj => (
                  <tr key={adj.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-700">{formatDate(adj.created_at)}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">{adj.product_name}</div>
                      <div className="text-xs text-slate-500">{adj.product_sku}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{adj.previous_quantity}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{adj.adjusted_quantity}</td>
                    <td className={`px-6 py-4 text-sm font-semibold ${adj.difference >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {adj.difference >= 0 ? '+' : ''}{adj.difference}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${getAdjustmentBadge(adj.adjustment_type)}`}>
                        {adj.adjustment_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{adj.reason}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{adj.adjusted_by_name}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleDelete(adj.id)}
                        className="text-rose-600 hover:text-rose-800 text-sm font-semibold"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Adjustment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">New Inventory Adjustment</h3>
              <p className="text-sm text-slate-500 mt-1">Adjust stock quantity to match physical count</p>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Product *</label>
                <select
                  name="product_id"
                  value={formData.product_id}
                  onChange={handleInputChange}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Select a product</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) - Current: {p.stock_quantity}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Adjusted Quantity *</label>
                <input
                  type="number"
                  name="adjusted_quantity"
                  value={formData.adjusted_quantity}
                  onChange={handleInputChange}
                  required
                  min="0"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="Enter the physical count"
                />
                {formData.product_id && (
                  <p className="text-xs text-slate-500 mt-1">
                    Current stock: {products.find(p => p.id === parseInt(formData.product_id))?.stock_quantity || 'N/A'}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Reason *</label>
                <select
                  name="reason"
                  value={formData.reason}
                  onChange={handleInputChange}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Select a reason</option>
                  <option value="Physical count">Physical count discrepancy</option>
                  <option value="Damaged goods">Damaged goods</option>
                  <option value="Theft/Loss">Theft/Loss</option>
                  <option value="Return">Return</option>
                  <option value="Data entry error">Data entry error</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="Additional details (optional)"
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
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow"
                >
                  Record Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
