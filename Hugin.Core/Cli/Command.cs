using Hugin.Core.Models;

namespace Hugin.Core.Cli;

public abstract record Command;

public sealed record SyncCommand(bool Full) : Command;

public sealed record NewCommand(bool MarkSeen) : Command;

public sealed record TrackCommand(string Orgnr, PipelineStatus Status, string? Why, string? Note, string? Svar) : Command;

public sealed record ListCommand(PipelineStatus? Status, bool Companies, string? Kommune, bool Ads) : Command;

public sealed record ExportCommand(DateTimeOffset? Since) : Command;

public sealed record HelpCommand : Command;

public sealed record InvalidCommand(string Error) : Command;
