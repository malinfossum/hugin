# csharp-layered

C# starter for console-based projects. Solution with a class library, a console front-end, and an NUnit test project — the same layering that later scales to an API.

## Folder structure

- `App.Core/` — domain model and rules. No `Console`, no `File`, no IO.
- `App.Console/` — `Program.cs` only. Calls into `App.Core`.
- `App.Tests/` — NUnit. References `App.Core` only, never `App.Console`.

## First 5 steps in a new project

1. Copy this folder to wherever the project lives.
2. Rename `App.slnx` and each `App.*` project + folder to `<YourName>.*` (find/replace `App.` across files).
3. Run `dotnet restore && dotnet build && dotnet test`.
4. Open `App.slnx` in Rider.
5. Start writing domain types in `App.Core/Models/`. Wire them from `Program.cs`.

## Working rules

- State, rules, and pure logic live in `App.Core`. If a class needs `Console.WriteLine` or `File.ReadAllText`, it belongs in `App.Console`, not `App.Core`.
- `App.Tests` references `App.Core` only. If something can't be unit-tested without IO, it doesn't belong in `App.Core`.
- `dotnet format` is the formatter (see `.editorconfig`); Rider applies the same rules on save.

## Adding an API project later

When a project outgrows the console, don't bolt an API on — start the next one from
[`scaffolds/csharp-api/`](../csharp-api), which ships this same layering with controllers,
EF Core + SQLite, and xUnit already wired.

## What's deliberately not here

- No DI container — add `Microsoft.Extensions.DependencyInjection` when the project earns it.
- No API project — see "Adding an API project later".
- No async, no JSON serialization — added per project.
