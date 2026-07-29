namespace VSP.MarketingOS.Domain.Entities;

public class Lead : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Company { get; set; }
    public string Status { get; set; } = "new"; // new | contacted | qualified | proposal | won | lost
    public int Score { get; set; }
    public decimal Value { get; set; }
    public string? Source { get; set; }
    public string? Notes { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}
