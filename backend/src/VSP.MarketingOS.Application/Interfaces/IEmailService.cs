namespace VSP.MarketingOS.Application.Interfaces;

/// <summary>
/// Email sending abstraction (SendGrid, AWS SES, SMTP, etc.)
/// </summary>
public interface IEmailService
{
    Task<bool> SendEmailAsync(EmailRequest request, CancellationToken ct = default);
    Task<bool> SendBulkEmailAsync(IEnumerable<EmailRequest> requests, CancellationToken ct = default);
    Task<EmailStats> GetCampaignStatsAsync(string campaignId, CancellationToken ct = default);
}

public record EmailRequest(
    string To,
    string Subject,
    string HtmlBody,
    string? PlainText = null,
    string? From = null,
    string? CampaignId = null
);

public record EmailStats(
    int Sent, int Opened, int Clicked, int Bounced, int Unsubscribed,
    double OpenRate, double ClickRate, double BounceRate
);
