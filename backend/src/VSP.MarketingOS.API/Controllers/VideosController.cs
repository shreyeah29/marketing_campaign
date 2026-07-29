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
public class VideosController : ControllerBase
{
    private readonly ILLMService _llm;
    private readonly AppDbContext _db;

    public VideosController(ILLMService llm, AppDbContext db)
    {
        _llm = llm;
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var orgId = User.GetOrganizationId();
        var list = await _db.Videos.AsNoTracking()
            .Where(v => v.OrganizationId == orgId && !v.IsDeleted)
            .OrderByDescending(v => v.CreatedAt)
            .ToListAsync();
        return Ok(list.Select(Map));
    }

    [HttpPost("generate")]
    public async Task<IActionResult> Generate([FromBody] GenerateVideoDto dto, CancellationToken ct)
    {
        var orgId = User.GetOrganizationId();
        var script = await _llm.GenerateContentAsync("video-script", $"{dto.Type}: {dto.Brief}", ct);
        var item = new MarketingVideo
        {
            Title = string.IsNullOrWhiteSpace(dto.Brief) ? $"{dto.Type} Video" : dto.Brief[..Math.Min(48, dto.Brief.Length)],
            Type = dto.Type,
            Status = "ready",
            Duration = "0:60",
            Script = script,
            Brief = dto.Brief,
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
        };
        _db.Videos.Add(item);
        await _db.SaveChangesAsync(ct);
        return Ok(Map(item));
    }

    private static object Map(MarketingVideo v) => new
    {
        id = v.Id.ToString(),
        title = v.Title,
        type = v.Type,
        status = v.Status,
        duration = v.Duration,
        script = v.Script,
        storyboard = new[] { "Hook", "Problem", "Solution", "Social Proof", "CTA" },
        voice = "Professional Female",
        music = "Corporate Ambient",
    };
}

public record GenerateVideoDto(string Type, string Brief);
