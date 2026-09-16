# Frontend Deployment

## Zero-Cost Deployment to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/adimishra-code/extensionguard)

---

## Quick Deploy (5 minutes)

### 1. Sign Up at Vercel
- Go to [vercel.com](https://vercel.com)
- Sign up with GitHub (free)

### 2. Import Your Repository
1. Dashboard → "Add New Project"
2. Import from GitHub
3. Select your `extensionguard` repository
4. Framework: **Vite**
5. Root Directory: **`frontend`**
6. Build Command: `npm run build`
7. Output Directory: `dist`

### 3. Environment Variables
Add these in Vercel dashboard:

```env
VITE_API_URL=https://your-backend.onrender.com
```

### 4. Deploy!
Click "Deploy" - your site will be live in ~2 minutes at:
```
https://extensionguard.vercel.app
```

---

## Alternative: Netlify

1. Sign up at [netlify.com](https://netlify.com)
2. New Site → Import from Git
3. Build settings:
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `frontend/dist`
4. Environment variables:
   ```
   VITE_API_URL=https://your-backend.onrender.com
   ```
5. Deploy!

---

## Alternative: Cloudflare Pages

1. Sign up at [pages.cloudflare.com](https://pages.cloudflare.com)
2. Create a project from GitHub
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `cd frontend && npm install && npm run build`
   - Build output directory: `frontend/dist`
4. Environment variables:
   ```
   VITE_API_URL=https://your-backend.onrender.com
   ```
5. Deploy!

---

## Update Extension with Production URL

After deploying backend, update your extension:

### 1. Update Constants
Edit `monitor-extension/src/constants.ts`:

```typescript
export const DEFAULT_CONFIG = {
  apiUrl: 'https://your-backend.onrender.com', // ← Update this
  syncEnabled: true,
  alertLevel: 'high' as const,
  scanFrequency: 60,
};
```

### 2. Update Manifest
Edit `monitor-extension/src/manifest.json`:

```json
{
  "host_permissions": [
    "https://your-backend.onrender.com/*"
  ]
}
```

### 3. Rebuild Extension
```bash
cd monitor-extension
npm run build
```

---

## Free Tier Features

### Vercel Free Tier:
- ✅ Unlimited projects
- ✅ 100 GB bandwidth/month
- ✅ Auto SSL certificates
- ✅ Custom domains
- ✅ Automatic deployments from Git
- ✅ Serverless functions (100GB-hrs/month)
- ❌ No team features

### Netlify Free Tier:
- ✅ 100 GB bandwidth/month
- ✅ 300 build minutes/month
- ✅ Custom domains
- ✅ Instant cache invalidation
- ✅ Deploy previews

### Cloudflare Pages:
- ✅ Unlimited bandwidth
- ✅ 500 builds/month
- ✅ Free SSL
- ✅ Global CDN

---

## Post-Deployment Checklist

- [ ] Test frontend at your Vercel URL
- [ ] Verify API connection works
- [ ] Test authentication flow
- [ ] Check all pages load correctly
- [ ] Update extension with production URL
- [ ] Test extension → backend connection

---

## Custom Domain (Optional but FREE)

### Get Free Domain:
1. **Freenom.com** - Free .tk, .ml, .ga, .cf domains
2. **Duck DNS** - Free subdomain (extensionguard.duckdns.org)

### Add to Vercel:
1. Vercel Dashboard → Your Project → Settings → Domains
2. Add your domain
3. Configure DNS (Vercel provides instructions)

---

## Environment Variables

Create `.env.production`:

```env
# Backend API
VITE_API_URL=https://your-backend.onrender.com

# Optional: Analytics
VITE_GA_ID=G-XXXXXXXXXX
```

**Important:** Never commit `.env` files! They're in `.gitignore`.

---

## Build Optimization

### 1. Enable Compression
Vercel/Netlify auto-enable gzip/brotli

### 2. Image Optimization
Use Vercel's built-in image optimization:
```jsx
import Image from 'next/image' // if using Next.js
```

### 3. Code Splitting
Vite automatically splits code - no config needed!

---

## Monitoring (Free)

### 1. Vercel Analytics (Free tier)
- Enable in Vercel dashboard
- 2,500 page views/month free

### 2. Google Analytics (Free)
Add to `index.html`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
```

### 3. Sentry (Error Tracking)
```bash
npm install @sentry/react
```

5,000 errors/month free tier

---

## Deployment Workflow

### Automatic Deployments
Every push to `main` branch auto-deploys:

```bash
git push origin main
# ✅ Vercel auto-deploys in ~2 minutes
```

### Preview Deployments
Every PR gets a preview URL:
```
https://extensionguard-git-feature-branch.vercel.app
```

---

## Troubleshooting

### "Failed to fetch" Error
- Check `VITE_API_URL` environment variable
- Verify backend CORS allows your frontend domain
- Check backend is running (not spun down)

### Build Failed
- Check build logs in Vercel dashboard
- Verify `package.json` scripts
- Ensure all dependencies are in `dependencies` (not `devDependencies`)

### 404 on Page Refresh
Add `vercel.json` in `frontend/`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## Cost Comparison

| Platform | Free Tier | Best For |
|----------|-----------|----------|
| **Vercel** | 100GB bandwidth | React/Next.js apps ⭐ |
| **Netlify** | 100GB bandwidth | Jamstack sites |
| **Cloudflare Pages** | Unlimited bandwidth | High traffic sites |

**Recommendation:** Use **Vercel** - best developer experience!

---

## Production URLs

After deployment, you'll have:

```
Backend:  https://extensionguard-api.onrender.com
Frontend: https://extensionguard.vercel.app
Docs:     https://extensionguard.vercel.app/docs
```

Update these in:
- Extension manifest
- README.md
- Documentation
