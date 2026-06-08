# Building locally (developers & maintainers)

**Players:** use the pre-built installer from **[Releases](https://github.com/Reyarzz/EveNewBro/releases/latest)** — see **[INSTALL.md](INSTALL.md)**. You do not need this file.

---

## Quick local build

1. Install **Node.js LTS** from https://nodejs.org/
2. Open PowerShell in this folder
3. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
```

Or double-click **`build.bat`** (same steps, opens `dist` when done).

## Manual build

```powershell
npm install
npm run icons
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm run build
dir dist
```

Output: `dist\EVE-NewBro-Setup-<version>.exe`

## Publish for everyone (recommended)

Do **not** ask users to run `build.bat`. Instead:

1. Push code to `main`
2. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\tag-and-release.ps1
```

3. GitHub Actions (`.github/workflows/release.yml`) builds and uploads the installer to **Releases**

## Common problems

| Problem | Fix |
|--------|-----|
| `electron-builder` is not recognized | Run `npm install` first |
| No `dist` folder | Build failed — read terminal errors |
| `sharp` / native module errors | Use current repo (`pngjs` only); `npm install` again |
| Script execution disabled | `powershell -ExecutionPolicy Bypass -File build-windows.ps1` |
| Build hangs | First build downloads Electron (~150 MB); wait 5–15 min |
| winCodeSign / symlink errors | Signing is disabled; enable **Developer Mode** or run build as Admin once |
| SmartScreen on first run | Unsigned app — **More info → Run anyway** |

## Portable .exe

```powershell
npm run build:portable
```

Produces `dist\EVE-NewBro-Portable-<version>.exe` (no installer wizard).
