using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;
using VSP.MarketingOS.Application.Interfaces;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/email")]
[Authorize]
public class EmailController : ControllerBase
{
    private readonly IEmailService _email;

    public EmailController(IEmailService email) => _email = email;

    [HttpGet("campaigns")]
    public IActionResult GetCampaigns() => Ok(AppStore.EmailCampaigns);

    [HttpGet("sequences")]
    public IActionResult GetSequences() => Ok(AppStore.EmailSequences);

    [HttpGet("stats")]
    public IActionResult GetStats()
    {
        var campaigns = AppStore.EmailCampaigns;
        return Ok(new
        {
            sent = campaigns.Sum(c => Convert.ToInt32(c["sent"])),
            openRate = campaigns.Average(c => Convert.ToDouble(c["openRate"])),
            clickRate = campaigns.Average(c => Convert.ToDouble(c["clickRate"])),
            bounceRate = 1.8,
            unsubscribeRate = 0.4,
        });
    }

    [HttpPost("campaigns")]
    public async Task<IActionResult> CreateCampaign([FromBody] CreateEmailCampaignDto dto, CancellationToken ct)
    {
        await _email.SendEmailAsync(new EmailRequest(
            "demo@example.com",
            dto.Subject ?? dto.Name,
            $"<p>Campaign: {dto.Name}</p>"
        ), ct);
        var item = new Dictionary<string, object?>
        {
            ["id"] = AppStore.NewId(),
            ["name"] = dto.Name,
            ["status"] = "active",
            ["sent"] = 0,
            ["openRate"] = 0.0,
            ["clickRate"] = 0.0,
            ["bounces"] = 0,
            ["subject"] = dto.Subject,
        };
        AppStore.Lock(() => AppStore.EmailCampaigns.Insert(0, item));
        return Ok(item);
    }

    [HttpPut("campaigns/{id}/status")]
    public IActionResult UpdateStatus(string id, [FromBody] UpdateCampaignStatusDto dto)
    {
        Dictionary<string, object?>? found = null;
        AppStore.Lock(() =>
        {
            found = AppStore.EmailCampaigns.FirstOrDefault(c => $"{c.GetValueOrDefault("id")}" == id);
            if (found != null) found["status"] = dto.Status;
        });
        if (found == null) return NotFound();
        return Ok(found);
    }
}

public record CreateEmailCampaignDto(string Name, string? Subject);
