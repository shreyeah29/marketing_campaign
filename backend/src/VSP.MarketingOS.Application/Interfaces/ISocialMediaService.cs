namespace VSP.MarketingOS.Application.Interfaces;

/// <summary>
/// Social media publishing abstraction (Buffer, Hootsuite, native platform APIs)
/// </summary>
public interface ISocialMediaService
{
    Task<bool> PublishPostAsync(SocialPost post, CancellationToken ct = default);
    Task<bool> SchedulePostAsync(SocialPost post, DateTime scheduledAt, CancellationToken ct = default);
    Task<SocialAnalytics> GetAnalyticsAsync(string platform, string organizationId, CancellationToken ct = default);
}

public record SocialPost(
    string Platform, // facebook | instagram | linkedin | x | youtube | tiktok
    string Content,
    string? MediaUrl = null,
    string? CampaignId = null
);

public record SocialAnalytics(
    string Platform,
    long Followers,
    long Reach,
    long Engagements,
    double EngagementRate
);
