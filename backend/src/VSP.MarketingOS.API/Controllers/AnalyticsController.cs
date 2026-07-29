using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AnalyticsController : ControllerBase
{
    [HttpGet("dashboard")]
    public IActionResult GetDashboard()
    {
        return Ok(new
        {
            marketingScore = 87,
            revenue = 95000,
            leads = 248,
            appointments = 34,
            roi = 340,
            conversionRate = 3.4,
            activeCampaigns = 12,
            revenueByMonth = new[]
            {
                new { month = "Jan", revenue = 42000 },
                new { month = "Feb", revenue = 55000 },
                new { month = "Mar", revenue = 48000 },
                new { month = "Apr", revenue = 72000 },
                new { month = "May", revenue = 68000 },
                new { month = "Jun", revenue = 89000 },
                new { month = "Jul", revenue = 95000 },
            }
        });
    }

    [HttpGet("channels")]
    public IActionResult GetChannelPerformance()
    {
        return Ok(new[]
        {
            new { Channel = "Facebook", Leads = 72, Roi = 320, Spend = 4500 },
            new { Channel = "Google", Leads = 54, Roi = 410, Spend = 3200 },
            new { Channel = "LinkedIn", Leads = 24, Roi = 280, Spend = 2000 },
            new { Channel = "Email", Leads = 30, Roi = 820, Spend = 480 },
        });
    }
}
