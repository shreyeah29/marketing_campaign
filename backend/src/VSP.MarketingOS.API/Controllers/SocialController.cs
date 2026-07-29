using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/social")]
[Authorize]
public class SocialController : ControllerBase
{
    [HttpGet("posts")]
    public IActionResult GetPosts([FromQuery] string? status) 
    {
        IEnumerable<Dictionary<string, object?>> list = AppStore.SocialPosts;
        if (!string.IsNullOrWhiteSpace(status))
            list = list.Where(p => $"{p.GetValueOrDefault("status")}" == status);
        return Ok(list.ToList());
    }

    [HttpPost("posts")]
    public IActionResult CreatePost([FromBody] CreateSocialPostDto dto)
    {
        var item = new Dictionary<string, object?>
        {
            ["id"] = AppStore.NewId(),
            ["platform"] = dto.Platform,
            ["content"] = dto.Content,
            ["status"] = dto.PublishNow ? "published" : "draft",
            ["scheduledAt"] = dto.PublishNow ? DateTime.UtcNow.ToString("o") : null,
            ["engagement"] = 0,
        };
        AppStore.Lock(() => AppStore.SocialPosts.Insert(0, item));
        return Ok(item);
    }

    [HttpPost("posts/schedule")]
    public IActionResult SchedulePost([FromBody] ScheduleSocialPostDto dto)
    {
        var item = new Dictionary<string, object?>
        {
            ["id"] = AppStore.NewId(),
            ["platform"] = dto.Platform,
            ["content"] = dto.Content,
            ["status"] = "scheduled",
            ["scheduledAt"] = dto.ScheduledAt,
            ["engagement"] = 0,
        };
        AppStore.Lock(() => AppStore.SocialPosts.Insert(0, item));
        return Ok(item);
    }

    [HttpGet("analytics")]
    public IActionResult Analytics()
    {
        return Ok(new
        {
            followers = 18420,
            reach = 94200,
            engagementRate = 4.8,
            postsThisWeek = AppStore.SocialPosts.Count,
            byPlatform = new[]
            {
                new { platform = "Facebook", reach = 32000, engagement = 4.2 },
                new { platform = "Instagram", reach = 41000, engagement = 6.1 },
                new { platform = "LinkedIn", reach = 15000, engagement = 3.4 },
                new { platform = "X", reach = 6200, engagement = 2.1 },
            }
        });
    }
}

public record CreateSocialPostDto(string Platform, string Content, bool PublishNow = false);
public record ScheduleSocialPostDto(string Platform, string Content, string ScheduledAt);
