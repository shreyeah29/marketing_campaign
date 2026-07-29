namespace VSP.MarketingOS.Domain.Entities;

public class Content : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // blog | email | landing | facebook | linkedin etc
    public string Body { get; set; } = string.Empty;
    public string Status { get; set; } = "draft"; // draft | saved | published
    public string? Prompt { get; set; }
    public int Version { get; set; } = 1;
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}
