using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class LeadsController : ControllerBase
{
    [HttpGet]
    public IActionResult GetLeads([FromQuery] string? status, [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        IEnumerable<Dictionary<string, object?>> list = AppStore.Leads;
        if (!string.IsNullOrWhiteSpace(status))
            list = list.Where(l => $"{l.GetValueOrDefault("status")}" == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.ToLowerInvariant();
            list = list.Where(l =>
                $"{l.GetValueOrDefault("name")}".ToLowerInvariant().Contains(q) ||
                $"{l.GetValueOrDefault("company")}".ToLowerInvariant().Contains(q) ||
                $"{l.GetValueOrDefault("email")}".ToLowerInvariant().Contains(q));
        }

        var all = list.ToList();
        var pageItems = all.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return Ok(new { data = pageItems, total = all.Count, page, pageSize });
    }

    [HttpGet("pipeline")]
    public IActionResult GetPipeline()
    {
        var stages = new[]
        {
            new { name = "New", count = AppStore.Leads.Count(l => $"{l["status"]}" == "new"), value = 180000, color = "bg-white/20" },
            new { name = "Contacted", count = AppStore.Leads.Count(l => $"{l["status"]}" == "contacted"), value = 135000, color = "bg-indigo-500" },
            new { name = "Qualified", count = AppStore.Leads.Count(l => $"{l["status"]}" == "qualified"), value = 96000, color = "bg-violet-500" },
            new { name = "Proposal", count = AppStore.Leads.Count(l => $"{l["status"]}" == "proposal"), value = 76000, color = "bg-cyan-500" },
            new { name = "Won", count = AppStore.Leads.Count(l => $"{l["status"]}" == "won"), value = 52000, color = "bg-emerald-500" },
        };
        return Ok(new
        {
            stages,
            stats = new
            {
                totalLeads = AppStore.Leads.Count,
                companies = 84,
                pipelineValue = "$539K",
                avgScore = AppStore.Leads.Count == 0 ? 0 : (int)AppStore.Leads.Average(l => Convert.ToInt32(l["score"])),
            }
        });
    }

    [HttpPost]
    public IActionResult CreateLead([FromBody] CreateLeadDto dto)
    {
        var id = AppStore.NewId();
        var item = new Dictionary<string, object?>
        {
            ["id"] = id,
            ["name"] = dto.Name,
            ["email"] = dto.Email,
            ["phone"] = dto.Phone ?? "",
            ["company"] = dto.Company ?? "",
            ["status"] = "new",
            ["score"] = 40,
            ["value"] = 5000,
            ["source"] = dto.Source ?? "Manual",
            ["date"] = DateTime.UtcNow.ToString("MMM d"),
        };
        AppStore.Lock(() =>
        {
            AppStore.Leads.Insert(0, item);
            AppStore.Activity.Insert(0, new Dictionary<string, object?>
            {
                ["id"] = AppStore.NewId(),
                ["text"] = $"{dto.Name} lead created ({dto.Source ?? "Manual"})",
                ["time"] = "just now",
                ["status"] = "new",
                ["color"] = "bg-emerald-500",
            });
        });
        return CreatedAtAction(nameof(GetLeads), new { id }, item);
    }

    [HttpPut("{id}/status")]
    public IActionResult UpdateStatus(string id, [FromBody] UpdateStatusDto dto)
    {
        Dictionary<string, object?>? found = null;
        AppStore.Lock(() =>
        {
            found = AppStore.Leads.FirstOrDefault(l => $"{l.GetValueOrDefault("id")}" == id);
            if (found != null) found["status"] = dto.Status;
        });
        if (found == null) return NotFound(new { message = "Lead not found" });
        return Ok(found);
    }
}

public record CreateLeadDto(string Name, string Email, string? Phone, string? Company, string? Source);
public record UpdateStatusDto(string Status);
