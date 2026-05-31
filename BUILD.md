# Building the Windows installer

If there is **no `dist` folder**, the build never completed. Follow these steps.

## Quick build (recommended)

1. Install **Node.js LTS** from https://nodejs.org/ if you do not have it.
2. Open PowerShell in this folder (`eve-newbro-overlay`).
3. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
```

The script runs `npm install`, generates the icon, builds the installer, and opens the `dist` folder when done.

## Manual build

```powershell
cd C:\Users\steve\eve-newbro-overlay
npm install
npm run icons
npm run build
dir dist
```

You should see something like:

`dist\EVE-NewBro-Setup-0.2.0.exe`

Share that file with other players.

## Publish source code to GitHub

Repo: https://github.com/Reyarzz/EveNewBro

```powershell
cd C:\Users\steve\eve-newbro-overlay
powershell -ExecutionPolicy Bypass -File .\push-to-github.ps1
```

Or manually:

```powershell
git init
git add -A
git commit -m "Initial commit: EVE NewBro overlay"
git remote add origin https://github.com/Reyarzz/EveNewBro.git
git branch -M main
git push -u origin main
```

**Do not commit** `node_modules/`, `dist/`, `.env`, or generated icons (see `.gitignore`).

### Share the installer via GitHub Releases

1. Push code (above).
2. On GitHub: **Releases → Create a new release** → tag `v0.2.0`.
3. Attach `dist\EVE-NewBro-Setup-0.2.0.exe` to the release.
4. Use the release download URL in your Discord post.

## Common problems

| Problem | Fix |
|--------|-----|
| `electron-builder` is not recognized | Run `npm install` first (not just `npm run build`). |
| No `dist` folder | Build failed — read the red errors in the terminal. |
| `sharp` / native module errors | Use current repo scripts (`pngjs` only); run `npm install` again. |
| Script execution disabled | Use `powershell -ExecutionPolicy Bypass -File build-windows.ps1` |
| Build hangs | First build downloads Electron (~150 MB); wait 5–15 minutes. |
| Antivirus blocks build | Allow the project folder or pause AV briefly during build. |
| `Cannot create symbolic link` / winCodeSign | Build is configured **without code signing** (`signAndEditExecutable: false`). If it still fails, enable **Settings → System → For developers → Developer Mode** (allows symlinks), or run `build.bat` **as Administrator** once to clear the cache, then rebuild. |
| Windows SmartScreen on first run | Normal for unsigned apps — click **More info → Run anyway**. |

## Portable .exe (no installer)

```powershell
npm run build:portable
```

Output: `dist\EVE-NewBro-Portable-0.2.0.exe`
