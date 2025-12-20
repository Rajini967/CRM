# Deployment Guide

## Quick Deployment Steps

After pulling the latest code from git, follow these steps to ensure the UI updates properly:

### Option 1: Using Deployment Script (Recommended)

**Windows:**
```bash
.\deploy-windows.bat
```

**Linux/Mac:**
```bash
chmod +x deploy.sh
./deploy.sh
```

### Option 2: Manual Deployment

1. **Pull latest code:**
   ```bash
   git pull origin main
   ```

2. **Install dependencies:**
   ```bash
   cd server
   npm install
   cd ../client
   npm install
   ```

3. **Clear build cache:**
   ```bash
   # Windows
   rmdir /s /q client\build
   rmdir /s /q client\node_modules\.cache
   rmdir /s /q server\node_modules\.cache
   
   # Linux/Mac
   rm -rf client/build
   rm -rf client/node_modules/.cache
   rm -rf server/node_modules/.cache
   ```

4. **Restart servers:**
   - Stop current servers (Ctrl+C)
   - Restart using `start-windows.bat` or `start.sh`

## Clearing Browser Cache

After deployment, users may need to clear their browser cache:

### Chrome/Edge:
- Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
- Select "Cached images and files"
- Click "Clear data"

### Firefox:
- Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
- Select "Cache"
- Click "Clear Now"

### Hard Refresh (Quick Fix):
- **Windows:** `Ctrl+Shift+R` or `Ctrl+F5`
- **Mac:** `Cmd+Shift+R`

## Troubleshooting

### UI Not Updating After Deployment

1. **Clear browser cache** (see above)
2. **Hard refresh** the page (`Ctrl+Shift+R`)
3. **Clear localStorage and sessionStorage:**
   - Open browser console (F12)
   - Run: `localStorage.clear(); sessionStorage.clear();`
   - Refresh the page

4. **Check if React dev server is running:**
   - The client should be running on port 5000
   - If using `npm start`, it should auto-reload on changes
   - If not, restart the client: `cd client && npm start`

5. **Verify code is updated:**
   - Check if `Settings.js` has the latest changes
   - Check git log: `git log -1`

### React Query Cache Issues

The app now automatically clears React Query cache on deployment. If you still see stale data:

1. Open browser console (F12)
2. Run: `localStorage.clear(); sessionStorage.clear();`
3. Refresh the page

### Build Cache Issues

If changes aren't reflected even after clearing browser cache:

1. **Delete node_modules and reinstall:**
   ```bash
   cd client
   rm -rf node_modules
   npm install
   ```

2. **Clear webpack cache:**
   ```bash
   cd client
   rm -rf node_modules/.cache
   ```

3. **Restart the dev server:**
   ```bash
   cd client
   npm start
   ```

## Production Deployment

For production deployments, build the React app:

```bash
cd client
npm run build
```

Then serve the `build` folder with a web server (nginx, Apache, etc.).

## Cache-Busting Features

The application includes automatic cache-busting:

1. **HTML meta tags** prevent browser caching
2. **Version tracking** in sessionStorage
3. **Automatic cache clearing** on version change
4. **React Query cache clearing** on app start
5. **Service worker cache clearing** (if applicable)

## Best Practices

1. **Always clear cache after deployment**
2. **Use deployment script** to automate the process
3. **Notify users** to clear cache after major updates
4. **Test in incognito mode** to verify changes
5. **Check browser console** for any errors

## Support

If you continue to experience caching issues:

1. Check browser console for errors
2. Verify server is running and responding
3. Check network tab for cached responses
4. Try accessing the app in incognito mode
5. Contact support with specific error messages
