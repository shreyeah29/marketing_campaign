using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class LeadsController : ControllerBase
{
    [HttpGet]
    public IActionResult GetLeads([FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        // Mock leads data
        var leads = new[]
        {
            new { Id = "1", Name = "Priya Sharma", Email = "priya@email.com", Status = "qualified", Score = 87, Value = 15000, Source = "Facebook Ad" },
            new { Id = "2", Name = "Rajesh Kumar", Email = "rajesh@techcorp.com", Status = "contacted", Score = 62, Value = 8000, Source = "Google Ad" },
            new { Id = "3", Name = "Suresh Mehta", Email = "suresh@gmail.com", Status = "proposal", Score = 91, Value = 25000, Source = "Referral" },
        };
        return Ok(new { data = leads, total = leads.Length, page, pageSize });
    }

    [HttpPost]
    public IActionResult CreateLead([FromBody] CreateLeadDto dto)
    {
        var id = Guid.NewGuid().ToString();
        return CreatedAtAction(nameof(GetLeads), new { id }, new { id, message = "Lead created successfully" });
    }

    [HttpPut("{id}/status")]
    public IActionResult UpdateStatus(string id, [FromBody] UpdateStatusDto dto)
    {
        return Ok(new { id, status = dto.Status, message = "Status updated" });
    }
}

public record CreateLeadDto(string Name, string Email, string? Phone, string? Company, string? Source);
public record UpdateStatusDto(string Status);
