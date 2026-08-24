using Hugin.Core.Models;
using Hugin.Core.Services;

namespace Hugin.Core.Cli;

public abstract record Command;

public sealed record SyncCommand(bool Full) : Command;

public sealed record NewCommand(bool MarkSeen) : Command;

public sealed record TrackCommand(string Orgnr, PipelineStatus Status, string? Why, string? Note, string? Svar) : Command;

public sealed record ListCommand(PipelineStatus? Status, bool Companies, string? Kommune, bool Ads) : Command;

public sealed record ExportCommand(ExtractFormat Format, ExtractScope Scope, string? Category, bool IncludeActive) : Command;

public sealed record HelpCommand : Command;

public sealed record InvalidCommand(string Error) : Command;
