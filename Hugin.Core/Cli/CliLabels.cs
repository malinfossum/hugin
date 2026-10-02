using Hugin.Core.Models;

namespace Hugin.Core.Cli;

/// <summary>
/// Bokmål labels the CLI prints for a pipeline status. Only the label follows the wording:
/// the stored value and the value you type (<c>hugin track &lt;orgnr&gt; active</c>) stay
/// <c>active</c>.
/// </summary>
public static class CliLabels
{
    public static string Status(PipelineStatus status) => status switch
    {
        PipelineStatus.Active => "følger med",
        PipelineStatus.Applied => "søkt",
        PipelineStatus.Answered => "svar",
        _ => status.ToString(),
    };
}
