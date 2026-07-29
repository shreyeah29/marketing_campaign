namespace VSP.MarketingOS.Domain.Entities;

public class AIJob : BaseEntity
{
    public string Type { get; set; } = string.Empty; // campaign | content | image | video
    public string Prompt { get; set; } = string.Empty;
    public string Status { get; set; } = "queued"; // queued | processing | completed | failed
    public string? ResultJson { get; set; }
    public string? Error { get; set; }
    public DateTime? CompletedAt { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid UserId { get; set; }
}
