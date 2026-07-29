using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VSP.MarketingOS.Application.Interfaces;
using VSP.MarketingOS.Domain.Entities;
using VSP.MarketingOS.Infrastructure.Persistence;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/whatsapp")]
[Authorize]
public class WhatsAppController : ControllerBase
{
    private readonly IWhatsAppService _wa;
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public WhatsAppController(IWhatsAppService wa, AppDbContext db)
    {
        _wa = wa;
        _db = db;
    }

    [HttpGet("conversations")]
    public async Task<IActionResult> GetConversations()
    {
        var orgId = User.GetOrganizationId();
        var list = await _db.WhatsAppThreads.AsNoTracking()
            .Where(t => t.OrganizationId == orgId && !t.IsDeleted)
            .OrderByDescending(t => t.UpdatedAt ?? t.CreatedAt)
            .ToListAsync();
        return Ok(list.Select(Map));
    }

    [HttpGet("conversations/{id}")]
    public async Task<IActionResult> GetConversation(Guid id)
    {
        var orgId = User.GetOrganizationId();
        var found = await _db.WhatsAppThreads.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == id && t.OrganizationId == orgId && !t.IsDeleted);
        if (found == null) return NotFound();
        return Ok(Map(found));
    }

    [HttpPost("messages")]
    public async Task<IActionResult> SendMessage([FromBody] SendWhatsAppDto dto, CancellationToken ct)
    {
        await _wa.SendMessageAsync(new WhatsAppMessage(dto.Phone ?? dto.ConversationId ?? "", dto.Text), ct);

        var orgId = User.GetOrganizationId();
        WhatsAppThread? convo = null;

        if (Guid.TryParse(dto.ConversationId, out var convoId))
            convo = await _db.WhatsAppThreads.FirstOrDefaultAsync(t => t.Id == convoId && t.OrganizationId == orgId && !t.IsDeleted, ct);

        if (convo == null && !string.IsNullOrWhiteSpace(dto.Phone))
            convo = await _db.WhatsAppThreads.FirstOrDefaultAsync(t => t.Phone == dto.Phone && t.OrganizationId == orgId && !t.IsDeleted, ct);

        if (convo == null)
        {
            convo = new WhatsAppThread
            {
                ContactName = dto.Phone ?? "New Contact",
                Phone = dto.Phone ?? "",
                Unread = 0,
                LastMessage = dto.Text,
                MessagesJson = "[]",
                OrganizationId = orgId,
                CreatedBy = User.GetUserId(),
            };
            _db.WhatsAppThreads.Add(convo);
        }

        var messages = JsonSerializer.Deserialize<List<WaMessage>>(convo.MessagesJson, JsonOpts)
                       ?? new List<WaMessage>();
        messages.Add(new WaMessage(
            Guid.NewGuid().ToString("N")[..8],
            "us",
            dto.Text,
            DateTime.UtcNow.ToString("h:mm tt")));
        convo.MessagesJson = JsonSerializer.Serialize(messages, JsonOpts);
        convo.LastMessage = dto.Text;
        convo.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(Map(convo));
    }

    [HttpPost("broadcast")]
    public async Task<IActionResult> Broadcast([FromBody] BroadcastDto dto, CancellationToken ct)
    {
        await _wa.SendBroadcastAsync("default-template", Enumerable.Repeat("recipient", dto.Recipients ?? 1), ct);
        return Ok(new { message = "Broadcast queued", recipients = dto.Recipients ?? 0, text = dto.Message });
    }

    private static object Map(WhatsAppThread t)
    {
        object messages;
        try
        {
            messages = JsonSerializer.Deserialize<JsonElement>(t.MessagesJson);
        }
        catch
        {
            messages = Array.Empty<object>();
        }

        return new
        {
            id = t.Id.ToString(),
            name = t.ContactName,
            phone = t.Phone,
            unread = t.Unread,
            lastMessage = t.LastMessage,
            lastAt = RelTime(t.UpdatedAt ?? t.CreatedAt),
            messages,
        };
    }

    private static string RelTime(DateTime utc)
    {
        var span = DateTime.UtcNow - utc;
        if (span.TotalMinutes < 1) return "just now";
        if (span.TotalMinutes < 60) return $"{(int)span.TotalMinutes}m ago";
        if (span.TotalHours < 24) return $"{(int)span.TotalHours}h ago";
        return utc.ToString("MMM d");
    }
}

public record SendWhatsAppDto(string? ConversationId, string? Phone, string Text);
public record BroadcastDto(string Message, int? Recipients);
file record WaMessage(string id, string from, string text, string at);
