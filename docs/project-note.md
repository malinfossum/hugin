# Project note — Hugin

A summary of what Hugin is, how it works, how it is built and where it stands.

**Last updated:** 23.09.2026 · **Version:** v3.6.1 · **Status:** finished and in daily use

---

## In short

Hugin is a job radar for the Norwegian developer job market. It watches the public registries
every morning, shows what is new in your region, and keeps track of who you have applied to.
It runs locally on your own machine, and the data never leaves it.

The name comes from Odin's raven of thought, who flies out each morning and returns with
tidings — while his sibling Munin remembers.

## Background

Job hunting meant opening the same five sites every morning and trying to remember what I had
already seen. The data is public: NAV publishes an open job-ad feed, and Brønnøysundregistrene
publishes every registered company. Rather than checking by hand, I let a program do the
morning round and show only the difference — what is new since last time.

## How a morning run works

You start a sync. Hugin reads the focus profile — which municipalities, which industry codes,
which keywords — and fetches new job ads from NAV's feed. The employers are looked up in
Brønnøysundregistrene.

The ads are then filtered: municipality is a hard gate, keywords narrow the title, and NAV's
own occupation categories drop coincidental matches. Whatever survives is stored.

Finally, only what has not been shown before is presented. You star the interesting ones, set a
company to *applied*, export a shortlist and mark the batch as seen. The next morning Hugin
starts from that mark — a timestamp in the database for the last time someone said "I have seen
this".

## Stack

The backend is C# on .NET 10, with EF Core over SQLite, tested with NUnit. The frontend is
React 19 with TypeScript, built with Vite and tested with Vitest.

The whole application ships as a single self-contained `.exe`. You double-click it, the browser
opens on localhost, and there is nothing to install — no .NET runtime, no database server.

## Architecture

Four projects, with dependencies pointing inward only:

- **Hugin.Core** — the pure domain. Models, filters, sync logic and services. No database, no
  HTTP, no file system; only interfaces that other layers implement.
- **Hugin.Infrastructure** — the implementations. The EF Core context and migrations, the HTTP
  clients for Brreg and NAV, and reading the configuration file.
- **Hugin.Console** and **Hugin.Api** — two thin hosts over the same core. One is a
  command-line tool, one is a web server. Neither contains business logic.
- **Hugin.Tests** — the test project, which is larger than the four production projects
  combined.

## The API

The dashboard is a single-page React app talking to a JSON API in the same process: ASP.NET
Core minimal APIs, around fifteen read endpoints and a dozen write endpoints, all over the same
SQLite file the command line uses. The CLI and the dashboard are therefore two faces of one
program, not two programs synchronising with each other.

**Every view is a real URL.** `/companies/912345678` can be bookmarked, reloaded and shared,
and browser back and forward work. The router is hand-written — around thirty lines, parse and
format as pure functions — rather than a routing library for five routes.

**Localhost is not a security boundary.** Any web page can send requests to
`http://localhost:5111`, and DNS rebinding can read the response back. Hugin therefore checks
the Host header and refuses anything that is not localhost, and every state-changing request
must send an `X-Hugin: 1` header. That is CSRF protection, not authentication: a random web
page cannot set a custom header, while a local process that is already trusted can.

## Two decisions worth explaining

**Sync is at-least-once, deliberately.** Writes are idempotent, and the feed cursor only
advances after a page has actually been stored. If a sync crashes halfway, that page is fetched
again on the next run instead of being silently skipped. Duplicates are cheap; a missed job ad
is not.

**Expired ads are a requirement, not a nicety.** NAV's API terms state that a republished ad
must be removed as soon as it becomes inactive. An ad past its deadline is therefore never
presented as active: every sync runs a local expiry sweep, and a company whose ads have all
expired moves to an *Expired* section — and back again if a new ad appears. The demo filters
out closed ads entirely.

## Demo

A read-only version runs on Azure App Service:
[hugin-demo.azurewebsites.net](https://hugin-demo.azurewebsites.net). It shows real ads and
companies from Innlandet with a seeded example pipeline, no personal data and no tracking. It
is the same binary as everything else, started with a `--public` flag that refuses all writes.
The first load after a period of inactivity takes a few seconds — it runs on the free tier.

## Status

Hugin is finished at v3.6.1 and in daily use. Ten tagged releases, 278 commits between
18 August and 21 September 2026, and 801 tests all passing: 414 on the backend, 387 on the
frontend. Every version has a specification written up front, under `docs/specs/`.

The aim was never to build a product, but to avoid the manual morning round. It is still built
properly — layered, tested and documented — because the project had to hold up to being looked
at.

## Common questions

| Question | Answer |
|---|---|
| Why not a framework like Next? | This is a local application, not a website. React plus two dependencies in total; everything else is the standard library. |
| Why SQLite? | One user, one file, zero setup. The database sits beside the exe and backs itself up before every migration. |
| Why both a CLI and a web dashboard? | The command line came first and is still the fastest morning check. The dashboard is an extra host over the same core and the same database, not a rewrite. |
| How large is the codebase? | Around 7,000 lines of C# production code, 7,700 lines of test code and 14,000 lines of frontend. |
| Does it pull from finn.no? | No. Neither finn.no nor proff.no permits scraping, so they are listed as link-outs under Sources in the app and clicked by hand. |
| Who can use it? | Anyone. MIT licence, pre-built exes under Releases, and it asks which part of Norway to cover the first time it starts. |

## Feedback and contributions

Feedback is welcome, particularly on these points:

1. **The interface** — layout, hierarchy, typography and colour. Does the dashboard tell you
   the most important thing first? The backend has had tests and reviews; the frontend has in
   practice only had my own taste, so this is where another pair of eyes is worth the most.
2. **The information architecture** — five views: dashboard, companies, applications, export
   and settings. Is that the right split?
3. **The architecture** — is the layering clean enough, or overcomplicated for a
   single-user application?

The code is open under the MIT licence, and pull requests are welcome — especially on design.
I hope the tool can be useful to more people than me: the market is the same for everyone
looking for developer work in Norway, and the registries are open to all.

**Links:** [demo](https://hugin-demo.azurewebsites.net) ·
[code and releases](https://github.com/malinfossum/hugin) · specifications under `docs/specs/`
