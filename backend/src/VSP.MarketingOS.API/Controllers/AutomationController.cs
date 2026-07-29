using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VSP.MarketingOS.Domain.Entities;
using VSP.MarketingOS.Infrastructure.Persistence;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AutomationController : ControllerBase
{
    private readonly AppDbContext _db;

    public AutomationController(AppDbContext db) => _db = db;

    [HttpGet("workflows")]
    public async Task<IActionResult> GetWorkflows()
    {
        var orgId = User.GetOrganizationId();
        var list = await _db.Workflows.AsNoTracking()
            .Where(w => w.OrganizationId == orgId && !w.IsDeleted)
            .OrderByDescending(w => w.CreatedAt)
            .ToListAsync();
        return Ok(list.Select(Map));
    }

    [HttpGet("executions")]
    public IActionResult GetExecutions() => Ok(new[]
    {
        new { id = "e1", workflow = "Lead → Email → WhatsApp → Call", status = "success", at = "2m ago", detail = "Priya Sharma — Email sent, WhatsApp queued" },
        new { id = "e2", workflow = "Missed Call Follow-up", status = "running", at = "8m ago", detail = "Rajesh Kumar — Waiting 15m" },
        new { id = "e3", workflow = "Lead → Email → WhatsApp → Call", status = "failed", at = "1h ago", detail = "Invalid WhatsApp template approval" },
    });

    [HttpPost("workflows")]
    public async Task<IActionResult> CreateWorkflow([FromBody] CreateWorkflowDto dto)
    {
        var orgId = User.GetOrganizationId();
        var steps = dto.Steps ?? Array.Empty<string>();
        var item = new Workflow
        {
            Name = dto.Name,
            Status = "paused",
            Runs = 0,
            SuccessRate = 100,
            StepsJson = JsonSerializer.Serialize(steps),
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
        };
        _db.Workflows.Add(item);
        await _db.SaveChangesAsync();
        return Ok(Map(item));
    }

    [HttpPut("workflows/{id}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateCampaignStatusDto dto)
    {
        var orgId = User.GetOrganizationId();
        var found = await _db.Workflows.FirstOrDefaultAsync(w => w.Id == id && w.OrganizationId == orgId && !w.IsDeleted);
        if (found == null) return NotFound();
        found.Status = dto.Status;
        found.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(Map(found));
    }

    private static object Map(Workflow w)
    {
        string[] steps;
        try
        {
            steps = JsonSerializer.Deserialize<string[]>(w.StepsJson) ?? Array.Empty<string>();
        }
        catch
        {
            steps = Array.Empty<string>();
        }

        return new
        {
            id = w.Id.ToString(),
            name = w.Name,
            status = w.Status,
            runs = w.Runs,
            successRate = w.SuccessRate,
            steps,
        };
    }
}

public record CreateWorkflowDto(string Name, string[]? Steps);
