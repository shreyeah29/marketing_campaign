using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VSP.MarketingOS.Application.Interfaces;
using VSP.MarketingOS.Domain.Entities;
using VSP.MarketingOS.Infrastructure.Persistence;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AIController : ControllerBase
{
    private readonly ILLMService _llm;
    private readonly AppDbContext _db;

    public AIController(ILLMService llm, AppDbContext db)
    {
        _llm = llm;
        _db = db;
    }

    [HttpPost("campaign")]
    public async Task<IActionResult> GenerateCampaign([FromBody] GenerateCampaignRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Prompt))
            return BadRequest(new { message = "Prompt is required" });

        var orgId = User.GetOrganizationId();
        var result = await _llm.GenerateCampaignAsync(request.Prompt, ct);

        _db.Activities.Add(new ActivityEvent
        {
            Text = $"AI generated campaign for: {request.Prompt[..Math.Min(60, request.Prompt.Length)]}",
            Status = "complete",
            Color = "bg-indigo-500",
            OrganizationId = orgId,
        });
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            summary = result.Summary,
            sections = result.Sections.Select(s => new { id = s.Id, title = s.Title, type = s.Type, content = s.Content }),
        });
    }

    [HttpPost("content")]
    public async Task<IActionResult> GenerateContent([FromBody] GenerateContentRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Type) || string.IsNullOrWhiteSpace(request.Brief))
            return BadRequest(new { message = "Type and brief are required" });

        var content = await _llm.GenerateContentAsync(request.Type, request.Brief, ct);
        return Ok(new { content, type = request.Type });
    }

    [HttpGet("insights")]
    public async Task<IActionResult> GetInsights(CancellationToken ct)
    {
        var insights = await _llm.GenerateInsightsAsync("dashboard", ct);
        return Ok(insights.Select(t => new
        {
            text = t,
            priority = t.Contains("higher") || t.Contains("Mobile") ? "high" : "medium",
        }));
    }

    [HttpPost("campaign/save")]
    public async Task<IActionResult> SaveCampaignSections([FromBody] SaveCampaignRequest request)
    {
        var orgId = User.GetOrganizationId();
        var item = new Campaign
        {
            Name = request.Name ?? "AI Generated Campaign",
            Channel = "Multi-channel",
            Status = "draft",
            Budget = 0,
            Description = request.Summary,
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
            StartDate = DateTime.UtcNow,
        };
        _db.Campaigns.Add(item);
        _db.Activities.Add(new ActivityEvent
        {
            Text = $"Campaign saved: {item.Name}",
            Status = "complete",
            Color = "bg-indigo-500",
            OrganizationId = orgId,
        });
        await _db.SaveChangesAsync();
        return Ok(new { id = item.Id.ToString(), message = "Campaign saved" });
    }
}

public record GenerateCampaignRequest(string Prompt, Guid? OrganizationId);
public record GenerateContentRequest(string Type, string Brief);
public record SaveCampaignRequest(string? Name, string? Summary, object? Sections);
