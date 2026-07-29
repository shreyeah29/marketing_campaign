using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CampaignsController : ControllerBase
{
    [HttpGet]
    public IActionResult GetCampaigns()
    {
        var campaigns = new[]
        {
            new { Id = "1", Name = "NRI Dallas Facebook Campaign", Channel = "Facebook", Status = "active", Budget = 4500, Spent = 3840, Leads = 72, Roi = 320 },
            new { Id = "2", Name = "Google Search — NRI Legal", Channel = "Google Ads", Status = "active", Budget = 3200, Spent = 2760, Leads = 54, Roi = 410 },
            new { Id = "3", Name = "Email NRI Welcome Series", Channel = "Email", Status = "active", Budget = 480, Spent = 380, Leads = 30, Roi = 820 },
        };
        return Ok(campaigns);
    }

    [HttpPost]
    public IActionResult CreateCampaign([FromBody] CreateCampaignDto dto)
    {
        return CreatedAtAction(nameof(GetCampaigns), new { id = Guid.NewGuid() }, new { message = "Campaign created" });
    }

    [HttpPut("{id}/status")]
    public IActionResult UpdateStatus(string id, [FromBody] UpdateCampaignStatusDto dto)
    {
        return Ok(new { id, status = dto.Status });
    }
}

public record CreateCampaignDto(string Name, string Channel, decimal Budget, DateTime? StartDate, DateTime? EndDate);
public record UpdateCampaignStatusDto(string Status);
