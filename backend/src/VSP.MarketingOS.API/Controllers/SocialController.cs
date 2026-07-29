using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VSP.MarketingOS.Domain.Entities;
using VSP.MarketingOS.Infrastructure.Persistence;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/social")]
[Authorize]
public class SocialController : ControllerBase
{
    private readonly AppDbContext _db;

    public SocialController(AppDbContext db) => _db = db;

    [HttpGet("posts")]
    public async Task<IActionResult> GetPosts([FromQuery] string? status)
    {
        var orgId = User.GetOrganizationId();
        var q = _db.SocialPosts.AsNoTracking().Where(p => p.OrganizationId == orgId && !p.IsDeleted);
        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(p => p.Status == status);
        var list = await q.OrderByDescending(p => p.CreatedAt).ToListAsync();
        return Ok(list.Select(Map));
    }

    [HttpPost("posts")]
    public async Task<IActionResult> CreatePost([FromBody] CreateSocialPostDto dto)
    {
        var orgId = User.GetOrganizationId();
        var item = new SocialPost
        {
            Platform = dto.Platform,
            Content = dto.Content,
            Status = dto.PublishNow ? "published" : "draft",
            ScheduledAt = dto.PublishNow ? DateTime.UtcNow : null,
            Engagement = 0,
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
        };
        _db.SocialPosts.Add(item);
        await _db.SaveChangesAsync();
        return Ok(Map(item));
    }

    [HttpPost("posts/schedule")]
    public async Task<IActionResult> SchedulePost([FromBody] ScheduleSocialPostDto dto)
    {
        var orgId = User.GetOrganizationId();
        DateTime? scheduledAt = DateTime.TryParse(dto.ScheduledAt, out var dt) ? dt.ToUniversalTime() : null;
        var item = new SocialPost
        {
            Platform = dto.Platform,
            Content = dto.Content,
            Status = "scheduled",
            ScheduledAt = scheduledAt,
            Engagement = 0,
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
        };
        _db.SocialPosts.Add(item);
        await _db.SaveChangesAsync();
        return Ok(Map(item));
    }

    [HttpGet("analytics")]
    public async Task<IActionResult> Analytics()
    {
        var orgId = User.GetOrganizationId();
        var postsThisWeek = await _db.SocialPosts.AsNoTracking()
            .CountAsync(p => p.OrganizationId == orgId && !p.IsDeleted);
        return Ok(new
        {
            followers = 18420,
            reach = 94200,
            engagementRate = 4.8,
            postsThisWeek,
            byPlatform = new[]
            {
                new { platform = "Facebook", reach = 32000, engagement = 4.2 },
                new { platform = "Instagram", reach = 41000, engagement = 6.1 },
                new { platform = "LinkedIn", reach = 15000, engagement = 3.4 },
                new { platform = "X", reach = 6200, engagement = 2.1 },
            }
        });
    }

    private static object Map(SocialPost p) => new
    {
        id = p.Id.ToString(),
        platform = p.Platform,
        content = p.Content,
        status = p.Status,
        scheduledAt = p.ScheduledAt?.ToString("o"),
        engagement = p.Engagement,
    };
}

public record CreateSocialPostDto(string Platform, string Content, bool PublishNow = false);
public record ScheduleSocialPostDto(string Platform, string Content, string ScheduledAt);
