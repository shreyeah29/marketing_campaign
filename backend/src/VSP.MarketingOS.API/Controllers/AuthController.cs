using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace VSP.MarketingOS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IConfiguration _config;

    public AuthController(IConfiguration config) => _config = config;

    [HttpPost("login")]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        // Mock authentication — replace with real user lookup + bcrypt verify
        if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Password))
            return BadRequest(new { message = "Email and password are required" });

        // Demo credentials for MVP
        var user = new
        {
            Id = "1",
            Name = "Sarah Mitchell",
            Email = request.Email,
            Role = "Admin",
            Organization = "VSP Law Associates"
        };

        var token = GenerateJwt(user.Id, user.Email, user.Role);

        return Ok(new
        {
            token,
            user
        });
    }

    [HttpPost("forgot-password")]
    public IActionResult ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        // Mock — in real implementation: look up user, send reset email
        return Ok(new { message = "Reset link sent if email exists" });
    }

    private string GenerateJwt(string userId, string email, string role)
    {
        var secret = _config["Jwt:Secret"] ?? "VSP-AI-Marketing-OS-Secret-Key-2024-Enterprise";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, userId),
            new Claim(ClaimTypes.Email, email),
            new Claim(ClaimTypes.Role, role),
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

public record LoginRequest(string Email, string Password);
public record ForgotPasswordRequest(string Email);
