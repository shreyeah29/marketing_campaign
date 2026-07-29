using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VSP.MarketingOS.Application.Interfaces;
using VSP.MarketingOS.Domain.Entities;
using VSP.MarketingOS.Infrastructure.Persistence;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/email")]
[Authorize]
public class EmailController : ControllerBase
{
    private readonly IEmailService _email;
    private readonly AppDbContext _db;

    public EmailController(IEmailService email, AppDbContext db)
    {
        _email = email;
        _db = db;
    }

    [HttpGet("campaigns")]
    public async Task<IActionResult> GetCampaigns()
    {
        var orgId = User.GetOrganizationId();
        var list = await _db.EmailCampaigns.AsNoTracking()
            .Where(c => c.OrganizationId == orgId && !c.IsDeleted)
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();
        return Ok(list.Select(Map));
    }

    [HttpGet("sequences")]
    public IActionResult GetSequences() => Ok(new[]
    {
        new { id = "1", name = "5-Part Welcome", steps = 5, active = true, subscribers = 340 },
        new { id = "2", name = "Consultation Nurture", steps = 4, active = true, subscribers = 128 },
    });

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var orgId = User.GetOrganizationId();
        var campaigns = await _db.EmailCampaigns.AsNoTracking()
            .Where(c => c.OrganizationId == orgId && !c.IsDeleted)
            .ToListAsync();
        return Ok(new
        {
            sent = campaigns.Sum(c => c.Sent),
            openRate = campaigns.Count == 0 ? 0.0 : campaigns.Average(c => c.OpenRate),
            clickRate = campaigns.Count == 0 ? 0.0 : campaigns.Average(c => c.ClickRate),
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

        var orgId = User.GetOrganizationId();
        var item = new EmailCampaign
        {
            Name = dto.Name,
            Subject = dto.Subject,
            Status = "active",
            Sent = 0,
            OpenRate = 0,
            ClickRate = 0,
            Bounces = 0,
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
        };
        _db.EmailCampaigns.Add(item);
        await _db.SaveChangesAsync(ct);
        return Ok(Map(item));
    }

    [HttpPut("campaigns/{id}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateCampaignStatusDto dto)
    {
        var orgId = User.GetOrganizationId();
        var found = await _db.EmailCampaigns.FirstOrDefaultAsync(c => c.Id == id && c.OrganizationId == orgId && !c.IsDeleted);
        if (found == null) return NotFound();
        found.Status = dto.Status;
        found.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(Map(found));
    }

    private static object Map(EmailCampaign c) => new
    {
        id = c.Id.ToString(),
        name = c.Name,
        status = c.Status,
        sent = c.Sent,
        openRate = c.OpenRate,
        clickRate = c.ClickRate,
        bounces = c.Bounces,
        subject = c.Subject,
    };
}

public record CreateEmailCampaignDto(string Name, string? Subject);
