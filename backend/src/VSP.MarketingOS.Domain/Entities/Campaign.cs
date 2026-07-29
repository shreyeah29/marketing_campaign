namespace VSP.MarketingOS.Domain.Entities;

public class Campaign : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Status { get; set; } = "draft"; // draft | active | paused | completed
    public string Channel { get; set; } = string.Empty;
    public decimal Budget { get; set; }
    public decimal Spent { get; set; }
    public int Leads { get; set; }
    public int Conversions { get; set; }
    public decimal Roi { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}
