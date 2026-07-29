using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CampaignsController : ControllerBase
{
    [HttpGet]
    public IActionResult GetCampaigns([FromQuery] string? search, [FromQuery] string? status)
    {
        IEnumerable<Dictionary<string, object?>> list = AppStore.Campaigns;
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.ToLowerInvariant();
            list = list.Where(c =>
                ($"{c.GetValueOrDefault("name")}".ToLowerInvariant().Contains(q)) ||
                ($"{c.GetValueOrDefault("channel")}".ToLowerInvariant().Contains(q)));
        }
        if (!string.IsNullOrWhiteSpace(status))
            list = list.Where(c => $"{c.GetValueOrDefault("status")}" == status);

        return Ok(list.ToList());
    }

    [HttpPost]
    public IActionResult CreateCampaign([FromBody] CreateCampaignDto dto)
    {
        var id = AppStore.NewId();
        var item = new Dictionary<string, object?>
        {
            ["id"] = id,
            ["name"] = dto.Name,
            ["channel"] = dto.Channel,
            ["status"] = "draft",
            ["budget"] = dto.Budget,
            ["spent"] = 0m,
            ["leads"] = 0,
            ["conversions"] = 0,
            ["roi"] = 0,
            ["start"] = dto.StartDate?.ToString("MMM d") ?? DateTime.UtcNow.ToString("MMM d"),
            ["end"] = dto.EndDate?.ToString("MMM d") ?? "Ongoing",
        };
        AppStore.Lock(() => AppStore.Campaigns.Insert(0, item));
        return CreatedAtAction(nameof(GetCampaigns), new { id }, item);
    }

    [HttpPut("{id}/status")]
    public IActionResult UpdateStatus(string id, [FromBody] UpdateCampaignStatusDto dto)
    {
        Dictionary<string, object?>? found = null;
        AppStore.Lock(() =>
        {
            found = AppStore.Campaigns.FirstOrDefault(c => $"{c.GetValueOrDefault("id")}" == id);
            if (found != null) found["status"] = dto.Status;
        });
        if (found == null) return NotFound(new { message = "Campaign not found" });
        return Ok(found);
    }
}

public record CreateCampaignDto(string Name, string Channel, decimal Budget, DateTime? StartDate, DateTime? EndDate);
public record UpdateCampaignStatusDto(string Status);
