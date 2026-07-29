using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;
using VSP.MarketingOS.Application.Interfaces;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class VideosController : ControllerBase
{
    private readonly ILLMService _llm;

    public VideosController(ILLMService llm) => _llm = llm;

    [HttpGet]
    public IActionResult List() => Ok(AppStore.Videos);

    [HttpPost("generate")]
    public async Task<IActionResult> Generate([FromBody] GenerateVideoDto dto, CancellationToken ct)
    {
        var script = await _llm.GenerateContentAsync("video-script", $"{dto.Type}: {dto.Brief}", ct);
        var item = new Dictionary<string, object?>
        {
            ["id"] = AppStore.NewId(),
            ["title"] = string.IsNullOrWhiteSpace(dto.Brief) ? $"{dto.Type} Video" : dto.Brief[..Math.Min(48, dto.Brief.Length)],
            ["type"] = dto.Type,
            ["status"] = "ready",
            ["duration"] = "0:60",
            ["script"] = script,
            ["storyboard"] = new[] { "Hook", "Problem", "Solution", "Social Proof", "CTA" },
            ["voice"] = "Professional Female",
            ["music"] = "Corporate Ambient",
        };
        AppStore.Lock(() => AppStore.Videos.Insert(0, item));
        return Ok(item);
    }
}

public record GenerateVideoDto(string Type, string Brief);
