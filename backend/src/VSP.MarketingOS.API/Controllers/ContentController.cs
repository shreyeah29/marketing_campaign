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
public class ContentController : ControllerBase
{
    private readonly ILLMService _llm;
    private readonly AppDbContext _db;

    public ContentController(ILLMService llm, AppDbContext db)
    {
        _llm = llm;
        _db = db;
    }

    [HttpGet("drafts")]
    public async Task<IActionResult> GetDrafts()
    {
        var orgId = User.GetOrganizationId();
        var list = await _db.Contents.AsNoTracking()
            .Where(c => c.OrganizationId == orgId && !c.IsDeleted)
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();
        return Ok(list.Select(Map));
    }

    [HttpPost("generate")]
    public async Task<IActionResult> Generate([FromBody] GenerateContentRequest request, CancellationToken ct)
    {
        var content = await _llm.GenerateContentAsync(request.Type, request.Brief, ct);
        return Ok(new { content, type = request.Type });
    }

    [HttpPost("drafts")]
    public async Task<IActionResult> SaveDraft([FromBody] SaveDraftDto dto)
    {
        var orgId = User.GetOrganizationId();
        var item = new Content
        {
            Title = dto.Title,
            Type = dto.Type,
            Body = dto.Content,
            Status = "draft",
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
        };
        _db.Contents.Add(item);
        await _db.SaveChangesAsync();
        return Ok(Map(item));
    }

    private static object Map(Content c) => new
    {
        id = c.Id.ToString(),
        title = c.Title,
        type = c.Type,
        status = c.Status,
        content = c.Body,
        date = RelTime(c.CreatedAt),
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

public record SaveDraftDto(string Title, string Type, string Content);
