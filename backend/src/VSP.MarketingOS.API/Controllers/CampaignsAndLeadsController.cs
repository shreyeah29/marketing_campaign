using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VSP.MarketingOS.Application.Interfaces;
using VSP.MarketingOS.Domain.Entities;
using VSP.MarketingOS.Infrastructure.Persistence;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CampaignsController : ControllerBase
{
    private readonly AppDbContext _db;
    public CampaignsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetCampaigns([FromQuery] string? search, [FromQuery] string? status)
    {
        var orgId = User.GetOrganizationId();
        var q = _db.Campaigns.AsNoTracking().Where(c => c.OrganizationId == orgId && !c.IsDeleted);
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(c => c.Status == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            q = q.Where(c => c.Name.ToLower().Contains(s) || c.Channel.ToLower().Contains(s));
        }
        var list = await q.OrderByDescending(c => c.CreatedAt).ToListAsync();
        return Ok(list.Select(Map));
    }

    [HttpPost]
    public async Task<IActionResult> CreateCampaign([FromBody] CreateCampaignDto dto)
    {
        var orgId = User.GetOrganizationId();
        var item = new Campaign
        {
            Name = dto.Name,
            Channel = dto.Channel,
            Budget = dto.Budget,
            Status = "draft",
            StartDate = dto.StartDate ?? DateTime.UtcNow,
            EndDate = dto.EndDate,
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
        };
        _db.Campaigns.Add(item);
        _db.Activities.Add(new ActivityEvent
        {
            Text = $"Campaign created: {item.Name}",
            Status = "new",
            Color = "bg-indigo-500",
            OrganizationId = orgId,
        });
        await _db.SaveChangesAsync();
        return Ok(Map(item));
    }

    [HttpPut("{id}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateCampaignStatusDto dto)
    {
        var orgId = User.GetOrganizationId();
        var item = await _db.Campaigns.FirstOrDefaultAsync(c => c.Id == id && c.OrganizationId == orgId);
        if (item == null) return NotFound(new { message = "Campaign not found" });
        item.Status = dto.Status;
        item.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(Map(item));
    }

    private static object Map(Campaign c) => new
    {
        id = c.Id.ToString(),
        name = c.Name,
        channel = c.Channel,
        status = c.Status,
        budget = c.Budget,
        spent = c.Spent,
        leads = c.Leads,
        conversions = c.Conversions,
        roi = c.Roi,
        start = c.StartDate?.ToString("MMM d") ?? "",
        end = c.EndDate?.ToString("MMM d") ?? "Ongoing",
    };
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class LeadsController : ControllerBase
{
    private readonly AppDbContext _db;
    public LeadsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetLeads([FromQuery] string? status, [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var orgId = User.GetOrganizationId();
        var q = _db.Leads.AsNoTracking().Where(l => l.OrganizationId == orgId && !l.IsDeleted);
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(l => l.Status == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            q = q.Where(l => l.Name.ToLower().Contains(s) || (l.Company != null && l.Company.ToLower().Contains(s)) || l.Email.ToLower().Contains(s));
        }
        var total = await q.CountAsync();
        var data = await q.OrderByDescending(l => l.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return Ok(new
        {
            data = data.Select(l => new
            {
                id = l.Id.ToString(),
                name = l.Name,
                email = l.Email,
                phone = l.Phone,
                company = l.Company,
                status = l.Status,
                score = l.Score,
                value = l.Value,
                source = l.Source,
                date = l.CreatedAt.ToString("MMM d"),
            }),
            total,
            page,
            pageSize,
        });
    }

    [HttpGet("pipeline")]
    public async Task<IActionResult> GetPipeline()
    {
        var orgId = User.GetOrganizationId();
        var leads = await _db.Leads.AsNoTracking().Where(l => l.OrganizationId == orgId && !l.IsDeleted).ToListAsync();
        string[] names = ["new", "contacted", "qualified", "proposal", "won"];
        var stages = names.Select(n => new
        {
            name = char.ToUpper(n[0]) + n[1..],
            count = leads.Count(l => l.Status == n),
            value = (int)leads.Where(l => l.Status == n).Sum(l => l.Value),
            color = n switch
            {
                "new" => "bg-white/20",
                "contacted" => "bg-indigo-500",
                "qualified" => "bg-violet-500",
                "proposal" => "bg-cyan-500",
                _ => "bg-emerald-500",
            }
        });
        return Ok(new
        {
            stages,
            stats = new
            {
                totalLeads = leads.Count,
                companies = leads.Select(l => l.Company).Where(c => !string.IsNullOrWhiteSpace(c)).Distinct().Count(),
                pipelineValue = $"${leads.Sum(l => l.Value) / 1000:0}K",
                avgScore = leads.Count == 0 ? 0 : (int)leads.Average(l => l.Score),
            }
        });
    }

    [HttpPost]
    public async Task<IActionResult> CreateLead([FromBody] CreateLeadDto dto)
    {
        var orgId = User.GetOrganizationId();
        var item = new Lead
        {
            Name = dto.Name,
            Email = dto.Email,
            Phone = dto.Phone,
            Company = dto.Company,
            Source = dto.Source ?? "Manual",
            Status = "new",
            Score = 40,
            Value = dto.Value ?? 5000,
            OrganizationId = orgId,
            CreatedBy = User.GetUserId(),
        };
        _db.Leads.Add(item);
        _db.Activities.Add(new ActivityEvent
        {
            Text = $"{dto.Name} lead created ({item.Source})",
            Status = "new",
            Color = "bg-emerald-500",
            OrganizationId = orgId,
        });
        await _db.SaveChangesAsync();
        return Ok(new
        {
            id = item.Id.ToString(),
            name = item.Name,
            email = item.Email,
            phone = item.Phone,
            company = item.Company,
            status = item.Status,
            score = item.Score,
            value = item.Value,
            source = item.Source,
            date = item.CreatedAt.ToString("MMM d"),
        });
    }

    [HttpPut("{id}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusDto dto)
    {
        var orgId = User.GetOrganizationId();
        var item = await _db.Leads.FirstOrDefaultAsync(l => l.Id == id && l.OrganizationId == orgId);
        if (item == null) return NotFound();
        item.Status = dto.Status;
        item.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { id = item.Id.ToString(), status = item.Status });
    }
}

public record CreateCampaignDto(string Name, string Channel, decimal Budget, DateTime? StartDate, DateTime? EndDate);
public record UpdateCampaignStatusDto(string Status);
public record CreateLeadDto(string Name, string Email, string? Phone, string? Company, string? Source, decimal? Value);
public record UpdateStatusDto(string Status);
