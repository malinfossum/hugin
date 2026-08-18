using System.Text;

namespace Hugin.Core.Services;

/// <summary>
/// Cleans third-party text (company names, ad titles) before it is stored or printed.
/// Company names and ad titles are external input: unsanitized, an ANSI escape sequence
/// in an ad title could retitle the terminal or spoof output.
/// </summary>
public static class Sanitizer
{
    // Strips C0/C1 control characters (incl. ESC → kills ANSI sequences at the root:
    // without ESC the "[31m" remainder is harmless text, but we also drop the CSI
    // parameter bytes that directly follow an ESC). Whitespace controls become one space.
    public static string Clean(string? input)
    {
        if (string.IsNullOrEmpty(input)) return "";

        var sb = new StringBuilder(input.Length);
        bool inEscape = false, lastWasSpace = false;

        foreach (var c in input)
        {
            if (c == '\u001b') { inEscape = true; continue; }
            if (inEscape) { if (char.IsLetter(c)) inEscape = false; continue; }

            if (c is '\r' or '\n' or '\t')
            {
                if (!lastWasSpace) { sb.Append(' '); lastWasSpace = true; }
                continue;
            }

            if (char.IsControl(c) || (c >= '\u0080' && c <= '\u009f')) continue;

            sb.Append(c);
            lastWasSpace = c == ' ';
        }

        return sb.ToString().Trim();
    }
}
