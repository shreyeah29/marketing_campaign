using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ImagesController : ControllerBase
{
    [HttpGet]
    public IActionResult List() => Ok(AppStore.Images);

    [HttpPost("generate")]
    public async Task<IActionResult> Generate([FromBody] GenerateImageDto dto, CancellationToken ct)
    {
        await Task.Delay(800, ct); // simulate generation latency
        var seed = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var item = new Dictionary<string, object?>
        {
            ["id"] = AppStore.NewId(),
            ["title"] = string.IsNullOrWhiteSpace(dto.Prompt) ? $"{dto.Type} Design" : dto.Prompt,
            ["type"] = dto.Type,
            ["size"] = "1080x1080",
            ["url"] = $"https://picsum.photos/seed/{seed}/400/400",
            ["liked"] = false,
            ["prompt"] = dto.Prompt,
        };
        AppStore.Lock(() => AppStore.Images.Insert(0, item));
        return Ok(item);
    }

    [HttpPut("{id}/like")]
    public IActionResult ToggleLike(string id)
    {
        Dictionary<string, object?>? found = null;
        AppStore.Lock(() =>
        {
            found = AppStore.Images.FirstOrDefault(i => $"{i.GetValueOrDefault("id")}" == id);
            if (found != null) found["liked"] = !(bool)(found["liked"] ?? false);
        });
        if (found == null) return NotFound();
        return Ok(found);
    }
}

public record GenerateImageDto(string Type, string Prompt);
