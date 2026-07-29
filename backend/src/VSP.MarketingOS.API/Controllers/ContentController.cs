using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;
using VSP.MarketingOS.Application.Interfaces;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ContentController : ControllerBase
{
    private readonly ILLMService _llm;

    public ContentController(ILLMService llm) => _llm = llm;

    [HttpGet("drafts")]
    public IActionResult GetDrafts() => Ok(AppStore.ContentDrafts);

    [HttpPost("generate")]
    public async Task<IActionResult> Generate([FromBody] GenerateContentRequest request, CancellationToken ct)
    {
        var content = await _llm.GenerateContentAsync(request.Type, request.Brief, ct);
        return Ok(new { content, type = request.Type });
    }

    [HttpPost("drafts")]
    public IActionResult SaveDraft([FromBody] SaveDraftDto dto)
    {
        var item = new Dictionary<string, object?>
        {
            ["id"] = AppStore.NewId(),
            ["title"] = dto.Title,
            ["type"] = dto.Type,
            ["status"] = "draft",
            ["content"] = dto.Content,
            ["date"] = "just now",
        };
        AppStore.Lock(() => AppStore.ContentDrafts.Insert(0, item));
        return Ok(item);
    }
}

public record SaveDraftDto(string Title, string Type, string Content);
