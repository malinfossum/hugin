using Hugin.Core.Cli;
using Hugin.Core.Models;

namespace Hugin.Tests;

public class CliLabelsTests
{
    [TestCase(PipelineStatus.Active, "følger med")]
    [TestCase(PipelineStatus.Applied, "søkt")]
    [TestCase(PipelineStatus.Answered, "svar")]
    public void Status_label_is_what_a_person_reads(PipelineStatus status, string expected)
        => Assert.That(CliLabels.Status(status), Is.EqualTo(expected));
}
