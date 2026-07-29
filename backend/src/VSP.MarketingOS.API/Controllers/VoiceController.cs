using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VSP.MarketingOS.Application.Interfaces;
using VSP.MarketingOS.Domain.Entities;
using VSP.MarketingOS.Infrastructure.Persistence;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/voice")]
[Authorize]
public class VoiceController : ControllerBase
{
    private readonly IVoiceService _voice;
    private readonly AppDbContext _db;

    public VoiceController(IVoiceService voice, AppDbContext db)
    {
        _voice = voice;
        _db = db;
    }

    [HttpGet("calls")]
    public async Task<IActionResult> GetCalls()
    {
        var orgId = User.GetOrganizationId();
        var list = await _db.VoiceCalls.AsNoTracking()
            .Where(c => c.OrganizationId == orgId && !c.IsDeleted)
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();
        return Ok(list.Select(Map));
    }

    [HttpGet("calls/{id}")]
    public async Task<IActionResult> GetCall(Guid id)
    {
        var orgId = User.GetOrganizationId();
        var found = await _db.VoiceCalls.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == id && c.OrganizationId == orgId && !c.IsDeleted);
        if (found == null) return NotFound();
        return Ok(Map(found));
    }

    [HttpPost("calls")]
    public async Task<IActionResult> InitiateCall([FromBody] InitiateCallDto dto, CancellationToken ct)
    {
        await _voice.InitiateCallAsync(new CallRequest(dto.Phone, "+12145550100", "nri-consult-script"), ct);
        var orgId = User.GetOrganizationId();
        var item = new VoiceCall
        {
            ContactName = dto.Name ?? "Unknown",
            Phone = dto.Phone,
            Status = "queued",
            Duration = "—",
            Disposition = "Pending",
            Summary = "Outbound AI call queued.",
            Transcript = "",
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
        };
        _db.VoiceCalls.Add(item);
        await _db.SaveChangesAsync(ct);
        return Ok(Map(item));
    }

    private static object Map(VoiceCall c) => new
    {
        id = c.Id.ToString(),
        name = c.ContactName,
        phone = c.Phone,
        status = c.Status,
        duration = c.Duration,
        disposition = c.Disposition,
        summary = c.Summary,
        transcript = c.Transcript,
    };
}

public record InitiateCallDto(string Phone, string? Name);
