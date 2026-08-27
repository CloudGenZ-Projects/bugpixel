# Setup & Run Commands

```bash
# 1. Install & Build
npm install
npm run build
npm run build:inspector --workspace packages/frontend
npm run seed --workspace packages/backend

# 2. Terminal 1 - Backend (:3000)
npm run start --workspace packages/backend

# 3. Terminal 2 - Frontend (:5173)
npm run dev --workspace packages/frontend

# 4. Terminal 3 - Sample Website (:8080)
npx serve sample-site -p 8080
```

## Logins
- **Admin**: `admin@example.com` / `admin-password`
- **Client**: `client@example.com` / `client-password`
- **Developer**: `developer@example.com` / `developer-password`
