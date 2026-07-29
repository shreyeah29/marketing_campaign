using VSP.MarketingOS.Application.Interfaces;

namespace VSP.MarketingOS.Infrastructure.Mock;

/// <summary>
/// Mock Email Service. Replace with SendGridEmailService or SESEmailService via DI.
/// </summary>
public class MockEmailService : IEmailService
{
    public async Task<bool> SendEmailAsync(EmailRequest request, CancellationToken ct = default)
    {
        await Task.Delay(10, ct);
        Console.WriteLine($"[MOCK EMAIL] To: {request.To} | Subject: {request.Subject}");
        return true;
    }

    public async Task<bool> SendBulkEmailAsync(IEnumerable<EmailRequest> requests, CancellationToken ct = default)
    {
        foreach (var r in requests) await SendEmailAsync(r, ct);
        return true;
    }

    public async Task<EmailStats> GetCampaignStatsAsync(string campaignId, CancellationToken ct = default)
    {
        await Task.Delay(10, ct);
        return new EmailStats(1240, 511, 159, 15, 4, 41.2, 12.8, 1.2);
    }
}
