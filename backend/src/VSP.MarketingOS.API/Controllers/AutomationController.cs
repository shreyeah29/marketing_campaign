using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AutomationController : ControllerBase
{
    [HttpGet("workflows")]
    public IActionResult GetWorkflows() => Ok(AppStore.Workflows);

    [HttpGet("executions")]
    public IActionResult GetExecutions() => Ok(AppStore.WorkflowExecutions);

    [HttpPost("workflows")]
    public IActionResult CreateWorkflow([FromBody] CreateWorkflowDto dto)
    {
        var item = new Dictionary<string, object?>
        {
            ["id"] = AppStore.NewId(),
            ["name"] = dto.Name,
            ["status"] = "paused",
            ["runs"] = 0,
            ["successRate"] = 100,
            ["steps"] = dto.Steps ?? Array.Empty<string>(),
        };
        AppStore.Lock(() => AppStore.Workflows.Insert(0, item));
        return Ok(item);
    }

    [HttpPut("workflows/{id}/status")]
    public IActionResult UpdateStatus(string id, [FromBody] UpdateCampaignStatusDto dto)
    {
        Dictionary<string, object?>? found = null;
        AppStore.Lock(() =>
        {
            found = AppStore.Workflows.FirstOrDefault(w => $"{w.GetValueOrDefault("id")}" == id);
            if (found != null) found["status"] = dto.Status;
        });
        if (found == null) return NotFound();
        return Ok(found);
    }
}

public record CreateWorkflowDto(string Name, string[]? Steps);
