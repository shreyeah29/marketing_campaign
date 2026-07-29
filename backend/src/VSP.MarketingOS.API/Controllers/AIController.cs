using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;
using VSP.MarketingOS.Application.Interfaces;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AIController : ControllerBase
{
    private readonly ILLMService _llm;

    public AIController(ILLMService llm) => _llm = llm;

    [HttpPost("campaign")]
    public async Task<IActionResult> GenerateCampaign([FromBody] GenerateCampaignRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Prompt))
            return BadRequest(new { message = "Prompt is required" });

        var result = await _llm.GenerateCampaignAsync(request.Prompt, ct);

        AppStore.Lock(() =>
        {
            AppStore.Activity.Insert(0, new Dictionary<string, object?>
            {
                ["id"] = AppStore.NewId(),
                ["text"] = $"AI generated campaign for: {request.Prompt[..Math.Min(60, request.Prompt.Length)]}",
                ["time"] = "just now",
                ["status"] = "complete",
                ["color"] = "bg-indigo-500",
            });
        });

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
    public IActionResult SaveCampaignSections([FromBody] SaveCampaignRequest request)
    {
        var id = AppStore.NewId();
        AppStore.Lock(() =>
        {
            AppStore.Campaigns.Insert(0, new Dictionary<string, object?>
            {
                ["id"] = id,
                ["name"] = request.Name ?? "AI Generated Campaign",
                ["channel"] = "Multi-channel",
                ["status"] = "draft",
                ["budget"] = 0m,
                ["spent"] = 0m,
                ["leads"] = 0,
                ["conversions"] = 0,
                ["roi"] = 0,
                ["start"] = DateTime.UtcNow.ToString("MMM d"),
                ["end"] = "TBD",
                ["summary"] = request.Summary,
                ["sections"] = request.Sections,
            });
        });
        return Ok(new { id, message = "Campaign saved" });
    }
}

public record GenerateCampaignRequest(string Prompt, Guid? OrganizationId);
public record GenerateContentRequest(string Type, string Brief);
public record SaveCampaignRequest(string? Name, string? Summary, object? Sections);
