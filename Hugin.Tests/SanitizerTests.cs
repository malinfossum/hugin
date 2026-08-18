using Hugin.Core.Services;

namespace Hugin.Tests;

public class SanitizerTests
{
    [Test]
    public void Strips_ansi_escape_sequences()
        => Assert.That(Sanitizer.Clean("Utvikler\u001b[31m søkes"), Is.EqualTo("Utvikler søkes"));

    [Test]
    public void Strips_c0_and_c1_controls()
        => Assert.That(Sanitizer.Clean("A\u0007B\u0090C"), Is.EqualTo("ABC"));

    [Test]
    public void Collapses_newlines_and_tabs_to_single_space()
        => Assert.That(Sanitizer.Clean("linje1\r\nlinje2\tslutt"), Is.EqualTo("linje1 linje2 slutt"));

    [Test]
    public void Preserves_norwegian_letters_and_emoji()
        => Assert.That(Sanitizer.Clean("Bærum ⚠ løsning på øya"), Is.EqualTo("Bærum ⚠ løsning på øya"));

    [Test]
    public void Null_becomes_empty()
        => Assert.That(Sanitizer.Clean(null), Is.EqualTo(""));
}
