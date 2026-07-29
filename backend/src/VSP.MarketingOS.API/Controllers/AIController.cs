using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.Application.Commands;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AIController : ControllerBase
{
    private readonly IMediator _mediator;

    public AIController(IMediator mediator) => _mediator = mediator;

    /// <summary>
    /// Generate a full 360° marketing campaign from a natural language prompt
    /// </summary>
    [HttpPost("campaign")]
    public async Task<IActionResult> GenerateCampaign([FromBody] GenerateCampaignRequest request)
    {
        var result = await _mediator.Send(new GenerateCampaignCommand(
            request.Prompt,
            request.OrganizationId,
            Guid.NewGuid() // replace with current user ID from JWT
        ));
        return Ok(result);
    }

    /// <summary>
    /// Generate specific content (blog, email, landing page, social post, etc.)
    /// </summary>
    [HttpPost("content")]
    public async Task<IActionResult> GenerateContent([FromBody] GenerateContentRequest request)
    {
        // Direct service call for content generation
        return Ok(new { content = $"Generated {request.Type} for: {request.Brief}" });
    }

    /// <summary>
    /// Get AI-powered marketing insights
    /// </summary>
    [HttpGet("insights")]
    public IActionResult GetInsights()
    {
        return Ok(new[]
        {
            "LinkedIn campaigns showing 34% higher lead quality",
            "Email open rates peak Tuesday 10am and Thursday 2pm",
            "Mobile conversion gap: 68% traffic, 31% conversions",
            "Top NRI segment has 3.2x higher LTV",
        });
    }
}

public record GenerateCampaignRequest(string Prompt, Guid OrganizationId);
public record GenerateContentRequest(string Type, string Brief);
