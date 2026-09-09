using System.Text.RegularExpressions;

namespace Hugin.Api;

/// <summary>SN2025 code shape: two digits, optionally a dot and one to three more.
/// Used before a code is written AND before it is interpolated into a Brreg query.</summary>
internal static partial class NaceCode
{
    [GeneratedRegex(@"^\d{2}(\.\d{1,3})?$")]
    public static partial Regex Pattern();
}
