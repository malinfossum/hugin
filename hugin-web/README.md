# hugin-web

React + TypeScript dashboard frontend for Hugin. Built into `Hugin.Api/wwwroot` by `build.ps1` during the release process; the dashboard is served from the ASP.NET Core host on startup.

## Development

Run the dev server and the API alongside:

```shell
# Terminal 1
npm run dev

# Terminal 2
dotnet run --project Hugin.Api
```

The dev server proxies `/api` to the API host at `http://127.0.0.1:5111`. Open `http://localhost:5173` to see changes live.

Other commands: `npm test` (Vitest), `npm run build` (compile + bundle to `../Hugin.Api/wwwroot`).

## Notes

`design-system/` is a read-only mirror synced from the workbench repo and is excluded from Biome formatting.
