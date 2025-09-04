# Deploy tips (fixing `Function Runtimes must have a valid version`)

If your Vercel build shows:
> Error: Function Runtimes must have a valid version, for example `now-php@1.0.0`

This is almost always caused by a legacy runtime setting from an old `vercel.json`/`now.json`
or a Project setting carried over from a previous import.

## Quick fixes

1. **No config file**: This project intentionally does **not** include `vercel.json`.
   Vercel will auto-detect the Node.js Serverless Functions in `api/` and use Node 20.

2. **Project Settings reset**:
   - In Vercel dashboard → Your Project → Settings → General → *Build & Development Settings*:
     - Framework Preset: **Other**
     - Build Command: **empty**
     - Output Directory: **empty**
     - Install Command: **Default** (leave blank)
   - In *Functions* section:
     - Runtime: **Node.js 20.x** (set at Project level if visible)
     - Memory/Timeout: defaults are fine.

3. **Remove legacy config**:
   - Ensure there is **no** `now.json` file anywhere in the repo.
   - If you previously set a legacy runtime (like `now-php@1.0.0`) in Project Settings,
     clear it and re-deploy.

4. **CLI fallback**:
   - If using `vercel.json` locally caused the error, delete it and push again.
     This repo version omits that file by design.

After these changes, trigger a fresh deploy.
