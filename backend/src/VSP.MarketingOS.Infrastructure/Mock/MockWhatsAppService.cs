using VSP.MarketingOS.Application.Interfaces;

namespace VSP.MarketingOS.Infrastructure.Mock;

public class MockWhatsAppService : IWhatsAppService
{
    public async Task<bool> SendMessageAsync(WhatsAppMessage message, CancellationToken ct = default)
    {
        await Task.Delay(10, ct);
        Console.WriteLine($"[MOCK WHATSAPP] To: {message.To} | Body: {message.Body[..Math.Min(50, message.Body.Length)]}...");
        return true;
    }

    public async Task<bool> SendBroadcastAsync(string templateId, IEnumerable<string> recipients, CancellationToken ct = default)
    {
        await Task.Delay(10, ct);
        return true;
    }

    public async Task<IEnumerable<WhatsAppConversation>> GetConversationsAsync(string organizationId, CancellationToken ct = default)
    {
        await Task.Delay(10, ct);
        return new[]
        {
            new WhatsAppConversation("Priya Sharma", "+1 469 555 0123", "Yes, I'm interested in the consultation", DateTime.UtcNow.AddMinutes(-2), 2),
            new WhatsAppConversation("Rajesh Kumar", "+1 214 555 0456", "Can we schedule for tomorrow 3pm?", DateTime.UtcNow.AddMinutes(-15), 0),
        };
    }
}
