namespace Hugin.Core.Models;

/// <summary>
/// A company from Brønnøysundregistrene — both hovedenheter and underenheter.
/// Branch offices have their own orgnr; <see cref="ParentOrgnr"/> links to the parent.
/// Rows are never deleted: a company that leaves the register keeps its last-seen date.
/// </summary>
public sealed class Company
{
    public required string Orgnr { get; init; }
    public required string Name { get; set; }
    public string? MunicipalityNumber { get; set; }
    public string? NaceCode { get; set; }
    public string? ParentOrgnr { get; set; }
    public bool IsBranch { get; set; }
    public string? Website { get; set; }

    /// <summary>The variant (https or http) that actually answered, when it differs from
    /// <see cref="Website"/> — e.g. the register lists an https URL that only serves over http.
    /// Null when the check never ran or the https variant itself answered.</summary>
    public string? WebsiteResolved { get; set; }

    /// <summary>Null = never checked. False = neither https nor http answered — the dashboard
    /// must not render a link to a dead site.</summary>
    public bool? WebsiteOk { get; set; }

    public DateTimeOffset? WebsiteCheckedUtc { get; set; }

    public DateTimeOffset FirstSeen { get; set; }
    public DateTimeOffset LastSeenInRegister { get; set; }
}
