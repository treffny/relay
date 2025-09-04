# Deploy notes

If Vercel shows a legacy runtime error, ensure this project has no `vercel.json` and that Project Settings use Node.js 20. 
No build command. No output directory. Framework preset "Other".
Functions are auto-detected from the `api/` folder.
