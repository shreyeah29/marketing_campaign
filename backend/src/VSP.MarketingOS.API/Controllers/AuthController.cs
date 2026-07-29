using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using VSP.MarketingOS.Domain.Entities;
using VSP.MarketingOS.Infrastructure.Persistence;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public AuthController(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) ||
            string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Password) ||
            string.IsNullOrWhiteSpace(request.OrganizationName))
        {
            return BadRequest(new { message = "Name, email, password, and organization are required" });
        }

        if (request.Password.Length < 6)
            return BadRequest(new { message = "Password must be at least 6 characters" });

        var email = request.Email.Trim().ToLowerInvariant();
        if (await _db.Users.AnyAsync(u => u.Email == email))
            return Conflict(new { message = "An account with this email already exists" });

        var orgId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        var org = new Organization
        {
            Id = orgId,
            Name = request.OrganizationName.Trim(),
            Industry = request.Industry?.Trim(),
            Website = request.Website?.Trim(),
            Plan = "Pro",
            Timezone = "UTC",
        };

        var user = new User
        {
            Id = userId,
            Name = request.Name.Trim(),
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Role = "Admin",
            OrganizationId = orgId,
            LastLoginAt = DateTime.UtcNow,
        };

        var settings = new OrgSettings
        {
            OrganizationId = orgId,
            Industry = org.Industry,
            Website = org.Website,
            Plan = "Pro",
            Seats = 5,
            Tagline = $"{org.Name} Marketing",
        };

        _db.Organizations.Add(org);
        _db.Users.Add(user);
        _db.OrgSettings.Add(settings);
        _db.Activities.Add(new ActivityEvent
        {
            Text = $"{user.Name} created the {org.Name} workspace",
            Status = "complete",
            Color = "bg-emerald-500",
            OrganizationId = orgId,
        });
        _db.Templates.Add(new MarketingTemplate
        {
            Name = "Starter Campaign Pack",
            Category = "Campaign",
            Uses = 0,
            OrganizationId = orgId,
        });

        await _db.SaveChangesAsync();

        var token = GenerateJwt(user);
        return Ok(new
        {
            token,
            user = new
            {
                id = user.Id.ToString(),
                name = user.Name,
                email = user.Email,
                role = user.Role,
                organization = org.Name,
                organizationId = org.Id.ToString(),
            }
        });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Email and password are required" });

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.Include(u => u.Organization)
            .FirstOrDefaultAsync(u => u.Email == email && !u.IsDeleted);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new { message = "Invalid email or password" });

        if (!user.IsActive)
            return Unauthorized(new { message = "Account is disabled" });

        user.LastLoginAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var token = GenerateJwt(user);
        return Ok(new
        {
            token,
            user = new
            {
                id = user.Id.ToString(),
                name = user.Name,
                email = user.Email,
                role = user.Role,
                organization = user.Organization?.Name ?? "Organization",
                organizationId = user.OrganizationId.ToString(),
            }
        });
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        // Always return OK to avoid email enumeration. Wire SendGrid later.
        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            var email = request.Email.Trim().ToLowerInvariant();
            _ = await _db.Users.AnyAsync(u => u.Email == email);
        }
        return Ok(new { message = "Reset link sent if email exists" });
    }

    private string GenerateJwt(User user)
    {
        var secret = _config["Jwt:Secret"] ?? "VSP-AI-Marketing-OS-Secret-Key-2024-Enterprise-Grade-Platform";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("org_id", user.OrganizationId.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var token = new JwtSecurityToken(
            claims: claims,
            expires: DateTime.UtcNow.AddDays(30),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public record RegisterRequest(
    string Name,
    string Email,
    string Password,
    string OrganizationName,
    string? Industry,
    string? Website
);

public record LoginRequest(string Email, string Password);
public record ForgotPasswordRequest(string Email);
