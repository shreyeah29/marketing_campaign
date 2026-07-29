using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VSP.MarketingOS.API.Data;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SettingsController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(AppStore.Settings);

    [HttpPut("organization")]
    public IActionResult UpdateOrganization([FromBody] Dictionary<string, object?> dto)
    {
        AppStore.Lock(() =>
        {
            var org = (Dictionary<string, object?>)AppStore.Settings["organization"]!;
            foreach (var kv in dto) org[kv.Key] = kv.Value;
        });
        return Ok(AppStore.Settings["organization"]);
    }

    [HttpPut("brand")]
    public IActionResult UpdateBrand([FromBody] Dictionary<string, object?> dto)
    {
        AppStore.Lock(() =>
        {
            var brand = (Dictionary<string, object?>)AppStore.Settings["brand"]!;
            foreach (var kv in dto) brand[kv.Key] = kv.Value;
        });
        return Ok(AppStore.Settings["brand"]);
    }

    [HttpPut("api-keys")]
    public IActionResult UpdateApiKeys([FromBody] Dictionary<string, object?> dto)
    {
        // Keys are accepted and stored in memory for now.
        // When real providers are wired, these will be read by Infrastructure services.
        AppStore.Lock(() =>
        {
            var keys = (Dictionary<string, object?>)AppStore.Settings["apiKeys"]!;
            foreach (var kv in dto) keys[kv.Key] = kv.Value;
        });
        return Ok(new { message = "API keys saved. Connect real providers in Program.cs DI when ready." });
    }

    [HttpGet("billing")]
    public IActionResult Billing() => Ok(AppStore.Settings["billing"]);
}
