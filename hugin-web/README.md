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

Other commands: `npm test` (Vitest), `npm run build` (compile + bundle to `../Hugin.Api/wwwroot`), `npm run lint`.

After making changes, run `npm run lint` and fix all errors. It runs Biome (formatting and the general lint rules) and then Oxlint, which runs only the [`@shadcn/lint`](https://github.com/shadcn-ui/lint) design-system rules (`.oxlintrc.json`): theme colors only, no arbitrary values, no inline styles, no restyling shadcn components beyond layout, no classes Tailwind can't generate.

## Notes

Styling is moving from the workbench design system to Tailwind v4 + shadcn/ui (Base UI). New UI uses shadcn components from `src/components/ui` (add one with `npx shadcn@latest add <name>` in the commit that first uses it) and the theme in `src/styles/index.css`, which carries the tokens from `DESIGN.md` (repo root).

`design-system/` is a read-only mirror synced from the workbench repo and is excluded from Biome formatting. It and `src/styles/main.css` load from `src/styles/legacy.css` into a `legacy` cascade layer, below Tailwind's utilities. The files that still use its classes are listed in the last override in `.oxlintrc.json`; migrate a file, then take it off that list. When the list is empty, the override, `legacy.css` and `design-system/` go.
