using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TemplatesController : ControllerBase
{
    [HttpGet]
    public IActionResult List([FromQuery] string? search, [FromQuery] string? category)
    {
        IEnumerable<Dictionary<string, object?>> list = AppStore.Templates;
        if (!string.IsNullOrWhiteSpace(category) && category != "All")
            list = list.Where(t => $"{t.GetValueOrDefault("category")}" == category);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.ToLowerInvariant();
            list = list.Where(t => $"{t.GetValueOrDefault("name")}".ToLowerInvariant().Contains(q));
        }
        return Ok(list.ToList());
    }

    [HttpPost]
    public IActionResult Create([FromBody] CreateTemplateDto dto)
    {
        var item = new Dictionary<string, object?>
        {
            ["id"] = AppStore.NewId(),
            ["name"] = dto.Name,
            ["category"] = dto.Category ?? "Campaign",
            ["uses"] = 0,
        };
        AppStore.Lock(() => AppStore.Templates.Insert(0, item));
        return Ok(item);
    }

    [HttpPost("{id}/use")]
    public IActionResult Use(string id)
    {
        Dictionary<string, object?>? found = null;
        AppStore.Lock(() =>
        {
            found = AppStore.Templates.FirstOrDefault(t => $"{t.GetValueOrDefault("id")}" == id);
            if (found != null) found["uses"] = Convert.ToInt32(found["uses"]) + 1;
        });
        if (found == null) return NotFound();
        return Ok(found);
    }
}

public record CreateTemplateDto(string Name, string? Category);
