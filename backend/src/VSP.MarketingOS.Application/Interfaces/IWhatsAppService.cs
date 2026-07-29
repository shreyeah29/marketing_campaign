namespace VSP.MarketingOS.Application.Interfaces;

/// <summary>
/// WhatsApp messaging abstraction (Meta WhatsApp Business API, Twilio, etc.)
/// </summary>
public interface IWhatsAppService
{
    Task<bool> SendMessageAsync(WhatsAppMessage message, CancellationToken ct = default);
    Task<bool> SendBroadcastAsync(string templateId, IEnumerable<string> recipients, CancellationToken ct = default);
    Task<IEnumerable<WhatsAppConversation>> GetConversationsAsync(string organizationId, CancellationToken ct = default);
}

public record WhatsAppMessage(string To, string Body, string? MediaUrl = null);

public record WhatsAppConversation(
    string ContactName,
    string Phone,
    string LastMessage,
    DateTime LastMessageAt,
    int UnreadCount
);
