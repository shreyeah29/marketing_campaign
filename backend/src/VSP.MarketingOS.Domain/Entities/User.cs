namespace VSP.MarketingOS.Domain.Entities;

public class User : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? Avatar { get; set; }
    public string Role { get; set; } = "Member";
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}
