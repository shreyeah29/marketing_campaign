using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VSP.MarketingOS.Domain.Entities;
using VSP.MarketingOS.Infrastructure.Persistence;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ImagesController : ControllerBase
{
    private readonly AppDbContext _db;

    public ImagesController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var orgId = User.GetOrganizationId();
        var list = await _db.Images.AsNoTracking()
            .Where(i => i.OrganizationId == orgId && !i.IsDeleted)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync();
        return Ok(list.Select(Map));
    }

    [HttpPost("generate")]
    public async Task<IActionResult> Generate([FromBody] GenerateImageDto dto, CancellationToken ct)
    {
        await Task.Delay(800, ct); // simulate generation latency
        var orgId = User.GetOrganizationId();
        var seed = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var item = new MarketingImage
        {
            Title = string.IsNullOrWhiteSpace(dto.Prompt) ? $"{dto.Type} Design" : dto.Prompt,
            Type = dto.Type,
            Size = "1080x1080",
            Url = $"https://picsum.photos/seed/{seed}/400/400",
            Liked = false,
            Prompt = dto.Prompt,
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
        };
        _db.Images.Add(item);
        await _db.SaveChangesAsync(ct);
        return Ok(Map(item));
    }

    [HttpPut("{id}/like")]
    public async Task<IActionResult> ToggleLike(Guid id)
    {
        var orgId = User.GetOrganizationId();
        var found = await _db.Images.FirstOrDefaultAsync(i => i.Id == id && i.OrganizationId == orgId && !i.IsDeleted);
        if (found == null) return NotFound();
        found.Liked = !found.Liked;
        found.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(Map(found));
    }

    private static object Map(MarketingImage i) => new
    {
        id = i.Id.ToString(),
        title = i.Title,
        type = i.Type,
        size = i.Size,
        url = i.Url,
        liked = i.Liked,
        prompt = i.Prompt,
    };
}

public record GenerateImageDto(string Type, string Prompt);
