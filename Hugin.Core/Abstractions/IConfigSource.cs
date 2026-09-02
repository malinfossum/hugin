using Hugin.Core.Config;

namespace Hugin.Core.Abstractions;

/// <summary>A fresh read of hugin.json on every call. Sync builds its scope through this at the
/// start of each run, so a config change never needs a restart (spec v3.4 Part C).</summary>
public interface IConfigSource
{
    public HuginConfig Load();
}
