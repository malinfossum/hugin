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
    public DateTimeOffset FirstSeen { get; set; }
    public DateTimeOffset LastSeenInRegister { get; set; }
}
