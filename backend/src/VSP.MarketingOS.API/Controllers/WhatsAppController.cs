using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;
using VSP.MarketingOS.Application.Interfaces;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/whatsapp")]
[Authorize]
public class WhatsAppController : ControllerBase
{
    private readonly IWhatsAppService _wa;

    public WhatsAppController(IWhatsAppService wa) => _wa = wa;

    [HttpGet("conversations")]
    public IActionResult GetConversations() => Ok(AppStore.WhatsAppConversations);

    [HttpGet("conversations/{id}")]
    public IActionResult GetConversation(string id)
    {
        var found = AppStore.WhatsAppConversations.FirstOrDefault(c => $"{c.GetValueOrDefault("id")}" == id);
        if (found == null) return NotFound();
        return Ok(found);
    }

    [HttpPost("messages")]
    public async Task<IActionResult> SendMessage([FromBody] SendWhatsAppDto dto, CancellationToken ct)
    {
        await _wa.SendMessageAsync(new WhatsAppMessage(dto.Phone ?? dto.ConversationId ?? "", dto.Text), ct);

        Dictionary<string, object?>? convo = null;
        AppStore.Lock(() =>
        {
            convo = AppStore.WhatsAppConversations.FirstOrDefault(c =>
                $"{c.GetValueOrDefault("id")}" == dto.ConversationId ||
                $"{c.GetValueOrDefault("phone")}" == dto.Phone);

            if (convo == null)
            {
                convo = new Dictionary<string, object?>
                {
                    ["id"] = AppStore.NewId(),
                    ["name"] = dto.Phone ?? "New Contact",
                    ["phone"] = dto.Phone ?? "",
                    ["unread"] = 0,
                    ["lastMessage"] = dto.Text,
                    ["lastAt"] = "just now",
                    ["messages"] = new List<object>(),
                };
                AppStore.WhatsAppConversations.Insert(0, convo);
            }

            var messages = (List<object>)convo["messages"]!;
            messages.Add(new { id = AppStore.NewId(), from = "us", text = dto.Text, at = DateTime.UtcNow.ToString("h:mm tt") });
            convo["lastMessage"] = dto.Text;
            convo["lastAt"] = "just now";
        });

        return Ok(convo);
    }

    [HttpPost("broadcast")]
    public async Task<IActionResult> Broadcast([FromBody] BroadcastDto dto, CancellationToken ct)
    {
        await _wa.SendBroadcastAsync("default-template", Enumerable.Repeat("recipient", dto.Recipients ?? 1), ct);
        return Ok(new { message = "Broadcast queued", recipients = dto.Recipients ?? 0, text = dto.Message });
    }
}

public record SendWhatsAppDto(string? ConversationId, string? Phone, string Text);
public record BroadcastDto(string Message, int? Recipients);
