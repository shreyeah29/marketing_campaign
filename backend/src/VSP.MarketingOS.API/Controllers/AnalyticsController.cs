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
public class AnalyticsController : ControllerBase
{
    private readonly ILLMService _llm;
    private readonly AppDbContext _db;

    public AnalyticsController(ILLMService llm, AppDbContext db)
    {
        _llm = llm;
        _db = db;
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        var orgId = User.GetOrganizationId();
        var activeCampaigns = await _db.Campaigns.AsNoTracking()
            .CountAsync(c => c.OrganizationId == orgId && !c.IsDeleted && c.Status == "active");
        var activity = await _db.Activities.AsNoTracking()
            .Where(a => a.OrganizationId == orgId && !a.IsDeleted)
            .OrderByDescending(a => a.CreatedAt)
            .Take(10)
            .ToListAsync();
        var tasks = await _db.Tasks.AsNoTracking()
            .Where(t => t.OrganizationId == orgId && !t.IsDeleted)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

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
                activeCampaigns,
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
            activity = activity.Select(MapActivity),
            tasks = tasks.Select(MapTask),
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
    public async Task<IActionResult> GetActivity()
    {
        var orgId = User.GetOrganizationId();
        var list = await _db.Activities.AsNoTracking()
            .Where(a => a.OrganizationId == orgId && !a.IsDeleted)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();
        return Ok(list.Select(MapActivity));
    }

    [HttpGet("tasks")]
    public async Task<IActionResult> GetTasks()
    {
        var orgId = User.GetOrganizationId();
        var list = await _db.Tasks.AsNoTracking()
            .Where(t => t.OrganizationId == orgId && !t.IsDeleted)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();
        return Ok(list.Select(MapTask));
    }

    [HttpPost("tasks")]
    public async Task<IActionResult> CreateTask([FromBody] CreateTaskDto dto)
    {
        var orgId = User.GetOrganizationId();
        var item = new OrgTask
        {
            Title = dto.Task,
            Due = dto.Due ?? "Soon",
            Priority = dto.Priority ?? "medium",
            Done = false,
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
        };
        _db.Tasks.Add(item);
        await _db.SaveChangesAsync();
        return Ok(MapTask(item));
    }

    private static object MapActivity(ActivityEvent a) => new
    {
        id = a.Id.ToString(),
        text = a.Text,
        time = RelTime(a.CreatedAt),
        status = a.Status,
        color = a.Color,
    };

    private static object MapTask(OrgTask t) => new
    {
        id = t.Id.ToString(),
        task = t.Title,
        due = t.Due,
        priority = t.Priority,
        done = t.Done,
    };

    private static string RelTime(DateTime utc)
    {
        var span = DateTime.UtcNow - utc;
        if (span.TotalMinutes < 1) return "just now";
        if (span.TotalMinutes < 60) return $"{(int)span.TotalMinutes}m ago";
        if (span.TotalHours < 24) return $"{(int)span.TotalHours}h ago";
        return utc.ToString("MMM d");
    }
}

public record CreateTaskDto(string Task, string? Due, string? Priority);
