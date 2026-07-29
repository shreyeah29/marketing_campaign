using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;
using VSP.MarketingOS.Application.Interfaces;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AnalyticsController : ControllerBase
{
    private readonly ILLMService _llm;

    public AnalyticsController(ILLMService llm) => _llm = llm;

    [HttpGet("dashboard")]
    public IActionResult GetDashboard()
    {
        return Ok(new
        {
            kpis = new
            {
                marketingScore = 87,
                revenue = 95000,
                leads = 248,
                appointments = 34,
                roi = 340,
                conversionRate = 3.4,
                activeCampaigns = AppStore.Campaigns.Count(c => $"{c["status"]}" == "active"),
            },
            revenueByMonth = new[]
            {
                new { month = "Jan", revenue = 42000, leads = 120, target = 40000 },
                new { month = "Feb", revenue = 55000, leads = 145, target = 45000 },
                new { month = "Mar", revenue = 48000, leads = 132, target = 50000 },
                new { month = "Apr", revenue = 72000, leads = 190, target = 55000 },
                new { month = "May", revenue = 68000, leads = 178, target = 60000 },
                new { month = "Jun", revenue = 89000, leads = 220, target = 70000 },
                new { month = "Jul", revenue = 95000, leads = 248, target = 80000 },
            },
            funnel = new[]
            {
                new { name = "Visitors", value = 12400 },
                new { name = "Leads", value = 3800 },
                new { name = "Qualified", value = 1240 },
                new { name = "Proposals", value = 480 },
                new { name = "Closed", value = 128 },
            },
            activity = AppStore.Activity.Take(10).ToList(),
            tasks = AppStore.Tasks.ToList(),
        });
    }

    [HttpGet("channels")]
    public IActionResult GetChannelPerformance()
    {
        return Ok(new[]
        {
            new { name = "Facebook", channel = "Facebook", value = 35, leads = 72, roi = 320, spend = 4500, revenue = 18900 },
            new { name = "Google", channel = "Google", value = 28, leads = 54, roi = 410, spend = 3200, revenue = 16320 },
            new { name = "LinkedIn", channel = "LinkedIn", value = 18, leads = 24, roi = 280, spend = 2000, revenue = 7600 },
            new { name = "Email", channel = "Email", value = 12, leads = 30, roi = 820, spend = 480, revenue = 4320 },
            new { name = "WhatsApp", channel = "WhatsApp", value = 7, leads = 36, roi = 650, spend = 800, revenue = 6000 },
        });
    }

    [HttpGet("recommendations")]
    public async Task<IActionResult> GetRecommendations(CancellationToken ct)
    {
        var insights = await _llm.GenerateInsightsAsync("analytics", ct);
        return Ok(insights.Select((t, i) => new
        {
            text = t,
            impact = i < 2 ? "High" : "Medium",
            effort = i % 2 == 0 ? "Low" : "Medium",
        }));
    }

    [HttpGet("activity")]
    public IActionResult GetActivity() => Ok(AppStore.Activity);

    [HttpGet("tasks")]
    public IActionResult GetTasks() => Ok(AppStore.Tasks);

    [HttpPost("tasks")]
    public IActionResult CreateTask([FromBody] CreateTaskDto dto)
    {
        var item = new Dictionary<string, object?>
        {
            ["id"] = AppStore.NewId(),
            ["task"] = dto.Task,
            ["due"] = dto.Due ?? "Soon",
            ["priority"] = dto.Priority ?? "medium",
            ["done"] = false,
        };
        AppStore.Lock(() => AppStore.Tasks.Insert(0, item));
        return Ok(item);
    }
}

public record CreateTaskDto(string Task, string? Due, string? Priority);
