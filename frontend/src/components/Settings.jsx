import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:5000/api';

export default function Settings({ onNavigate = () => {} }) {
  const userObj = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperAdmin = userObj.role === 'super_admin';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    tax_rate: '10.00',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const url = isSuperAdmin ? `${API_BASE_URL}/auth/me` : `${API_BASE_URL}/shops/my-shop`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error(isSuperAdmin ? 'Failed to retrieve account settings.' : 'Failed to retrieve shop settings.');
      }
      const data = await response.json();
      
      if (isSuperAdmin) {
        setFormData({
          name: data.name || '',
          email: data.email || '',
          phone: '',
          address: '',
          tax_rate: '10.00',
          password: '',
          confirmPassword: '',
          logo: data.logo || ''
        });
      } else {
        setFormData({
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          tax_rate: data.tax_rate !== undefined ? data.tax_rate : '10.00',
          password: '',
          confirmPassword: '',
          logo: data.logo || '',
          loyalty_enabled: data.loyalty_enabled === 1 || data.loyalty_enabled === true,
          loyalty_point_earn_rate: data.loyalty_point_earn_rate !== undefined ? data.loyalty_point_earn_rate : '100.00',
          loyalty_point_value: data.loyalty_point_value !== undefined ? data.loyalty_point_value : '1.00'
        });
      }
    } catch (err) {
      triggerAlert('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const triggerAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  
  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Accept larger source files, but we will compress them
    if (file.size > 15 * 1024 * 1024) {
      triggerAlert('error', 'Source image must be less than 15MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Get highly compressed PNG/JPEG DataURL
        const compressedBase64 = canvas.toDataURL('image/png');
        setFormData(prev => ({ ...prev, logo: compressedBase64 }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setFormData(prev => ({ ...prev, logo: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      triggerAlert('error', isSuperAdmin ? 'Name and email are required.' : 'Shop name and email are required.');
      return;
    }

    if (isSuperAdmin && formData.password) {
      if (formData.password.length < 6) {
        triggerAlert('error', 'Password must be at least 6 characters long.');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        triggerAlert('error', 'Passwords do not match.');
        return;
      }
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const url = isSuperAdmin ? `${API_BASE_URL}/auth/me` : `${API_BASE_URL}/shops/my-shop`;
      
      const bodyData = isSuperAdmin 
        ? { name: formData.name, email: formData.email, password: formData.password || undefined, logo: formData.logo }
        : { 
            name: formData.name, 
            email: formData.email, 
            phone: formData.phone, 
            address: formData.address, 
            tax_rate: formData.tax_rate, 
            logo: formData.logo,
            loyalty_enabled: formData.loyalty_enabled ? 1 : 0,
            loyalty_point_earn_rate: formData.loyalty_point_earn_rate,
            loyalty_point_value: formData.loyalty_point_value
          };

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(bodyData)
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || (isSuperAdmin ? 'Failed to update account details.' : 'Failed to update shop details.'));

      if (isSuperAdmin && resData.token && resData.user) {
        localStorage.setItem('token', resData.token);
        localStorage.setItem('user', JSON.stringify(resData.user));
      }

      triggerAlert('success', isSuperAdmin ? 'Account settings saved successfully!' : 'Shop settings saved successfully!');
      
      // Update local storage token values if necessary, or let it reload
      // Trigger a page refresh to update the global header brand name
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      triggerAlert('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      
      {alert && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center transition-all ${
          alert.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          <span className="text-sm font-semibold">{alert.message}</span>
        </div>
      )}

      {/* Title Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">
          {isSuperAdmin ? 'Account Settings' : 'Shop Settings'}
        </h2>
        <p className="text-sm text-slate-500">
          {isSuperAdmin 
            ? 'Configure profile details and system administrator credentials' 
            : 'Configure profile details, invoice labels, and shop contact cards'}
        </p>
      </div>

      {/* Main Settings Form Container */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-5">
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              {isSuperAdmin ? 'Administrator Full Name *' : 'Shop Display Name *'}
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              {isSuperAdmin ? 'Administrator Email *' : 'Official Shop Email *'}
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-xs"
            />
          </div>

          {!isSuperAdmin && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Contact Phone number
                </label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Store Physical Address
                </label>
                <textarea
                  name="address"
                  rows="3"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="e.g. 123 Main Street, Suite 400"
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Sales Tax Rate (%) *
                </label>
                <input
                  type="number"
                  name="tax_rate"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  value={formData.tax_rate}
                  onChange={handleInputChange}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="e.g. 10.00"
                />
              </div>

              {/* Loyalty Program Settings Section */}
              <div className="border-t border-slate-100 pt-5 mt-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-1">Customer Loyalty Points Program</h3>
                <p className="text-xs text-slate-400 mb-4">Configure custom loyalty points for customer spending and redemption.</p>
                
                <div className="space-y-4">
                  <div className="flex items-center space-x-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <input
                      type="checkbox"
                      id="loyalty_enabled"
                      name="loyalty_enabled"
                      checked={formData.loyalty_enabled || false}
                      onChange={(e) => setFormData({ ...formData, loyalty_enabled: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-slate-350 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="loyalty_enabled" className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
                      Enable Loyalty Points Program
                    </label>
                  </div>

                  {formData.loyalty_enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-7">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Earn Rate (Spent per Point) *
                        </label>
                        <input
                          type="number"
                          name="loyalty_point_earn_rate"
                          step="0.01"
                          min="1"
                          required={formData.loyalty_enabled}
                          value={formData.loyalty_point_earn_rate}
                          onChange={handleInputChange}
                          className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="e.g. 100.00"
                        />
                        <span className="text-[10px] text-slate-400">Customer earns 1 point for every N spent.</span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Redemption Value (per Point) *
                        </label>
                        <input
                          type="number"
                          name="loyalty_point_value"
                          step="0.01"
                          min="0.01"
                          required={formData.loyalty_enabled}
                          value={formData.loyalty_point_value}
                          onChange={handleInputChange}
                          className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="e.g. 1.00"
                        />
                        <span className="text-[10px] text-slate-400">Monetary discount value of 1 loyalty point.</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Unified Brand Logo Upload Section */}
          <div className="border-t border-slate-100 pt-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Brand Logo
            </label>
            <div className="mt-2 flex items-center space-x-5">
              {formData.logo ? (
                <img
                  src={formData.logo}
                  alt="Brand Logo Preview"
                  className="w-16 h-16 rounded-xl object-contain bg-slate-900 border border-slate-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 font-bold text-xs uppercase shrink-0">
                  No Logo
                </div>
              )}
              <div className="flex flex-col space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  id="logo-upload-input"
                  onChange={handleLogoChange}
                  className="hidden"
                />
                <div className="flex space-x-2">
                  <label
                    htmlFor="logo-upload-input"
                    className="cursor-pointer bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2 px-4 border border-slate-200 rounded-xl text-xs shadow-xs transition-colors"
                  >
                    Choose Image
                  </label>
                  {formData.logo && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold py-2 px-4 border border-rose-200 rounded-xl text-xs transition-colors"
                    >
                      Remove Logo
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-slate-450">PNG, JPG, or SVG. Max size 2MB.</span>
              </div>
            </div>
          </div>

          {isSuperAdmin && (
            <>
              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-slate-800 mb-1">Change Password</h3>
                <p className="text-xs text-slate-400 mb-4">Leave blank if you do not want to change your password.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="At least 6 characters"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Must match new password"
                />
              </div>
            </>
          )}

          {/* Action button */}
          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-slate-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-2.5 px-6 rounded-xl text-sm shadow-md transition-colors flex items-center space-x-2"
            >
              {saving ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
              ) : (
                <span>Save Configuration</span>
              )}
            </button>
          </div>

        </form>
      </div>

    </div>
  );
}
