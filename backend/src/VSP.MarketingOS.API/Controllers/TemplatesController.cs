using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VSP.MarketingOS.Domain.Entities;
using VSP.MarketingOS.Infrastructure.Persistence;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TemplatesController : ControllerBase
{
    private readonly AppDbContext _db;

    public TemplatesController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] string? category)
    {
        var orgId = User.GetOrganizationId();
        var q = _db.Templates.AsNoTracking().Where(t => t.OrganizationId == orgId && !t.IsDeleted);
        if (!string.IsNullOrWhiteSpace(category) && category != "All")
            q = q.Where(t => t.Category == category);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            q = q.Where(t => t.Name.ToLower().Contains(s));
        }
        var list = await q.OrderByDescending(t => t.CreatedAt).ToListAsync();
        return Ok(list.Select(Map));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTemplateDto dto)
    {
        var orgId = User.GetOrganizationId();
        var item = new MarketingTemplate
        {
            Name = dto.Name,
            Category = dto.Category ?? "Campaign",
            Uses = 0,
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
        };
        _db.Templates.Add(item);
        await _db.SaveChangesAsync();
        return Ok(Map(item));
    }

    [HttpPost("{id}/use")]
    public async Task<IActionResult> Use(Guid id)
    {
        var orgId = User.GetOrganizationId();
        var found = await _db.Templates.FirstOrDefaultAsync(t => t.Id == id && t.OrganizationId == orgId && !t.IsDeleted);
        if (found == null) return NotFound();
        found.Uses += 1;
        found.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(Map(found));
    }

    private static object Map(MarketingTemplate t) => new
    {
        id = t.Id.ToString(),
        name = t.Name,
        category = t.Category,
        uses = t.Uses,
    };
}

public record CreateTemplateDto(string Name, string? Category);
