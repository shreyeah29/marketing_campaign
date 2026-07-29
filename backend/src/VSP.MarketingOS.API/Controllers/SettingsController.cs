using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VSP.MarketingOS.Domain.Entities;
using VSP.MarketingOS.Infrastructure.Persistence;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;

    public SettingsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var orgId = User.GetOrganizationId();
        var org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.Id == orgId);
        var settings = await GetOrCreateSettingsAsync(orgId);
        return Ok(BuildPayload(org, settings));
    }

    [HttpPut("organization")]
    public async Task<IActionResult> UpdateOrganization([FromBody] Dictionary<string, JsonElement> dto)
    {
        var orgId = User.GetOrganizationId();
        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == orgId);
        var settings = await GetOrCreateSettingsAsync(orgId, track: true);

        if (dto.TryGetValue("name", out var nameEl) && org != null)
            org.Name = nameEl.GetString() ?? org.Name;
        if (dto.TryGetValue("website", out var webEl))
        {
            settings.Website = webEl.GetString();
            if (org != null) org.Website = settings.Website;
        }
        if (dto.TryGetValue("industry", out var indEl))
        {
            settings.Industry = indEl.GetString();
            if (org != null) org.Industry = settings.Industry;
        }
        if (dto.TryGetValue("timezone", out var tzEl))
        {
            settings.Timezone = tzEl.GetString() ?? settings.Timezone;
            if (org != null) org.Timezone = settings.Timezone;
        }

        settings.UpdatedAt = DateTime.UtcNow;
        if (org != null) org.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new
        {
            name = org?.Name ?? "",
            website = settings.Website,
            industry = settings.Industry,
            timezone = settings.Timezone,
        });
    }

    [HttpPut("brand")]
    public async Task<IActionResult> UpdateBrand([FromBody] Dictionary<string, JsonElement> dto)
    {
        var orgId = User.GetOrganizationId();
        var settings = await GetOrCreateSettingsAsync(orgId, track: true);

        if (dto.TryGetValue("primaryColor", out var colorEl))
            settings.PrimaryColor = colorEl.GetString() ?? settings.PrimaryColor;
        if (dto.TryGetValue("tagline", out var tagEl))
            settings.Tagline = tagEl.GetString() ?? settings.Tagline;
        if (dto.TryGetValue("voice", out var voiceEl))
            settings.BrandVoice = voiceEl.GetString() ?? settings.BrandVoice;

        settings.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new
        {
            primaryColor = settings.PrimaryColor,
            tagline = settings.Tagline,
            voice = settings.BrandVoice,
        });
    }

    [HttpPut("api-keys")]
    public async Task<IActionResult> UpdateApiKeys([FromBody] Dictionary<string, JsonElement> dto)
    {
        var orgId = User.GetOrganizationId();
        var settings = await GetOrCreateSettingsAsync(orgId, track: true);

        if (dto.TryGetValue("openai", out var openai))
            ApplyKey(openai.GetString(), v => settings.OpenAiKey = v);
        if (dto.TryGetValue("sendgrid", out var sendgrid))
            ApplyKey(sendgrid.GetString(), v => settings.SendGridKey = v);
        if (dto.TryGetValue("twilio", out var twilio))
            ApplyKey(twilio.GetString(), v => settings.TwilioKey = v);
        if (dto.TryGetValue("blandai", out var bland))
            ApplyKey(bland.GetString(), v => settings.BlandAiKey = v);

        settings.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { message = "API keys saved. Connect real providers in Program.cs DI when ready." });
    }

    [HttpGet("billing")]
    public async Task<IActionResult> Billing()
    {
        var orgId = User.GetOrganizationId();
        var settings = await GetOrCreateSettingsAsync(orgId);
        return Ok(new
        {
            plan = settings.Plan,
            seats = settings.Seats,
            renewsAt = DateTime.UtcNow.AddMonths(1).ToString("yyyy-MM-dd"),
            amount = 299,
        });
    }

    private async Task<OrgSettings> GetOrCreateSettingsAsync(Guid orgId, bool track = false)
    {
        OrgSettings? settings;
        if (track)
            settings = await _db.OrgSettings.FirstOrDefaultAsync(s => s.OrganizationId == orgId);
        else
            settings = await _db.OrgSettings.AsNoTracking().FirstOrDefaultAsync(s => s.OrganizationId == orgId);

        if (settings != null) return settings;

        settings = new OrgSettings { OrganizationId = orgId };
        _db.OrgSettings.Add(settings);
        await _db.SaveChangesAsync();
        return settings;
    }

    private static object BuildPayload(Organization? org, OrgSettings settings) => new
    {
        organization = new
        {
            name = org?.Name ?? "",
            website = settings.Website ?? org?.Website,
            industry = settings.Industry ?? org?.Industry,
            timezone = settings.Timezone,
        },
        brand = new
        {
            primaryColor = settings.PrimaryColor,
            tagline = settings.Tagline,
            voice = settings.BrandVoice,
        },
        apiKeys = new
        {
            openai = string.IsNullOrEmpty(settings.OpenAiKey) ? "" : "••••configured",
            sendgrid = string.IsNullOrEmpty(settings.SendGridKey) ? "" : "••••configured",
            twilio = string.IsNullOrEmpty(settings.TwilioKey) ? "" : "••••configured",
            blandai = string.IsNullOrEmpty(settings.BlandAiKey) ? "" : "••••configured",
        },
        billing = new
        {
            plan = settings.Plan,
            seats = settings.Seats,
            renewsAt = DateTime.UtcNow.AddMonths(1).ToString("yyyy-MM-dd"),
            amount = 299,
        },
    };

    private static void ApplyKey(string? value, Action<string> set)
    {
        if (string.IsNullOrWhiteSpace(value) || value.StartsWith("••••", StringComparison.Ordinal))
            return;
        set(value);
    }
}
