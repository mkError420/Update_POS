#  Multi-Tenant Point of Sale System

A full-stack, web-based **Multi-Tenant POS System** built with React + Node.js + MySQL. Each tenant shop operates in complete isolation — managed centrally by a Super Admin.

---

##  Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TailwindCSS |
| Backend | Node.js, Express |
| Database | MySQL 8 |
| Auth | JWT (JSON Web Tokens), bcryptjs |

---

##  Roles

| Role | Description |
|------|-------------|
| `super_admin` | Global control — manage all shops, reset passwords, CRUD tenants |
| `shop_admin` | Manage their own shop — products, staff, sales, customers |
| `shop_staff` | POS checkout, inventory view, customer lookup |

---

##  Features

### Super Admin
- Register new tenant shops (with shop admin account)
- Edit / suspend / delete shops
- View all users per tenant
- **Reset any tenant user's password**
- Suspend / activate individual users

### Shop Admin
- POS Checkout
- Inventory management (products, stock alerts)
- Supplier management
- Customer management
- Sales history & analytics
- Staff management
- Shop settings

### Authentication
- JWT-based login with role-aware routing
- Token validated against backend on startup (no stale mock tokens)
- Password strength meter on reset

---

##  Project Structure

```
MK/
├── backend/
│   ├── config/db.js          # MySQL connection pool
│   ├── middleware/auth.js     # JWT authenticate + authorize
│   ├── routes/
│   │   ├── auth.js           # Login, /me, register-shop
│   │   ├── shops.js          # Shop CRUD + user management
│   │   ├── products.js
│   │   ├── sales.js
│   │   ├── customers.js
│   │   ├── suppliers.js
│   │   ├── users.js          # Staff management
│   │   └── analytics.js
│   ├── server.js
│   ├── seed.js               # Demo data seeder
│   └── .env                  # (not committed — see below)
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Auth flow + routing
│   │   └── components/
│   │       ├── Login.jsx
│   │       ├── DashboardLayout.jsx
│   │       ├── Sidebar.jsx
│   │       ├── Dashboard.jsx
│   │       ├── ManageShops.jsx   # Super Admin tenant management
│   │       ├── Checkout.jsx
│   │       ├── Inventory.jsx
│   │       ├── Suppliers.jsx
│   │       ├── Customers.jsx
│   │       ├── SalesHistory.jsx
│   │       ├── ManageStaff.jsx
│   │       └── Settings.jsx
│   └── vite.config.js
└── database/
    └── schema.sql            # Full DB schema + super admin seed
```

---

##  Setup & Installation

### 1. Clone the repo
```bash
git clone https://github.com/mkError420/MultiTenant-POS.git
cd MultiTenant-POS
```

### 2. Database
```bash
# Import the schema into MySQL
mysql -u root -p < database/schema.sql
```

### 3. Backend
```bash
cd backend
npm install

# Create .env file
cp .env.example .env
# Fill in your DB credentials and JWT secret
```

**`.env` format:**
```
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASS=your_password
DB_NAME=multitenant_pos
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRE=8h
```

```bash
# Seed demo data (optional)
node seed.js

# Start backend
npm run dev
```

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
```

---

##  Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `mk.rabbani.cse@gmail.com` | `123456789` |
| Shop Admin | `alice@boutique.com` | `alice123` |
| Shop Admin | `admin@lakeside.com` | `lakeside123` |
| Shop Staff | `staff1@boutique.com` | `staff123` |

> Run `node backend/seed.js` after setup to create demo shops and users.

---

##  License

MIT — free to use and modify.
