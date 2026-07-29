namespace VSP.MarketingOS.Domain.Entities;

public class Organization : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Industry { get; set; }
    public string? Website { get; set; }
    public string? Logo { get; set; }
    public string? Description { get; set; }
    public string Timezone { get; set; } = "UTC";
    public string Plan { get; set; } = "Free";
    public bool IsActive { get; set; } = true;

    public ICollection<User> Users { get; set; } = new List<User>();
    public ICollection<Campaign> Campaigns { get; set; } = new List<Campaign>();
    public ICollection<Lead> Leads { get; set; } = new List<Lead>();
}
