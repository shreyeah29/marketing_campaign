using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;
using VSP.MarketingOS.Application.Interfaces;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/voice")]
[Authorize]
public class VoiceController : ControllerBase
{
    private readonly IVoiceService _voice;

    public VoiceController(IVoiceService voice) => _voice = voice;

    [HttpGet("calls")]
    public IActionResult GetCalls() => Ok(AppStore.VoiceCalls);

    [HttpGet("calls/{id}")]
    public IActionResult GetCall(string id)
    {
        var found = AppStore.VoiceCalls.FirstOrDefault(c => $"{c.GetValueOrDefault("id")}" == id);
        if (found == null) return NotFound();
        return Ok(found);
    }

    [HttpPost("calls")]
    public async Task<IActionResult> InitiateCall([FromBody] InitiateCallDto dto, CancellationToken ct)
    {
        await _voice.InitiateCallAsync(new CallRequest(dto.Phone, "+12145550100", "nri-consult-script"), ct);
        var item = new Dictionary<string, object?>
        {
            ["id"] = AppStore.NewId(),
            ["name"] = dto.Name ?? "Unknown",
            ["phone"] = dto.Phone,
            ["status"] = "queued",
            ["duration"] = "—",
            ["disposition"] = "Pending",
            ["summary"] = "Outbound AI call queued.",
            ["transcript"] = "",
        };
        AppStore.Lock(() => AppStore.VoiceCalls.Insert(0, item));
        return Ok(item);
    }
}

public record InitiateCallDto(string Phone, string? Name);
