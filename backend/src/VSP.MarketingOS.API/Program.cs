using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using MediatR;
using VSP.MarketingOS.Application.Interfaces;
using VSP.MarketingOS.Infrastructure.Mock;
using VSP.MarketingOS.API.Hubs;

var builder = WebApplication.CreateBuilder(args);

// ─── Services ───────────────────────────────────────────────────────────────

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "VSP AI Marketing OS API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new()
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
    });
    c.AddSecurityRequirement(new()
    {
        {
            new() { Reference = new() { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

// CORS — allow Vercel frontend + local dev
builder.Services.AddCors(opt =>
{
    opt.AddPolicy("VspFrontend", policy =>
    {
        policy
            .SetIsOriginAllowed(origin =>
            {
                if (string.IsNullOrWhiteSpace(origin)) return false;
                if (origin.StartsWith("http://localhost:")) return true;
                if (origin == "https://marketing-campaign-six.vercel.app") return true;
                if (origin.EndsWith(".vercel.app")) return true;
                var configured = builder.Configuration["AllowedOrigins"];
                return !string.IsNullOrWhiteSpace(configured) && origin == configured;
            })
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();
    });
});

// JWT Authentication
var jwtSecret = builder.Configuration["Jwt:Secret"] ?? "VSP-AI-Marketing-OS-Secret-Key-2024-Enterprise";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateIssuer = false,
            ValidateAudience = false,
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization();

// MediatR — scans Application assembly
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(VSP.MarketingOS.Application.Commands.GenerateCampaignCommand).Assembly));

// ─── AI & External Service Abstractions ─────────────────────────────────────
// 
// MOCK implementations — all return realistic data without calling external APIs.
// To connect real services, replace MockXxxService with your real implementation:
//
//   builder.Services.AddScoped<ILLMService, OpenAILLMService>();
//   builder.Services.AddScoped<IEmailService, SendGridEmailService>();
//   builder.Services.AddScoped<IWhatsAppService, TwilioWhatsAppService>();
//   builder.Services.AddScoped<IVoiceService, BlandAIVoiceService>();
//   builder.Services.AddScoped<ISocialMediaService, BufferSocialMediaService>();
//   builder.Services.AddScoped<IImageGenerationService, DallEImageGenerationService>();
//
// NO UI or API changes required — only change DI registrations below.

builder.Services.AddScoped<ILLMService, MockLLMService>();
builder.Services.AddScoped<IEmailService, MockEmailService>();
builder.Services.AddScoped<IWhatsAppService, MockWhatsAppService>();
builder.Services.AddScoped<IVoiceService, MockVoiceService>();

// SignalR for real-time updates (AI job progress, notifications)
builder.Services.AddSignalR();

// ─── App Pipeline ────────────────────────────────────────────────────────────

var app = builder.Build();

if (app.Environment.IsDevelopment() || app.Environment.IsStaging() || app.Environment.IsProduction())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "VSP AI Marketing OS v1"));
}

// Note: Render handles TLS at the load balancer level — no HTTPS redirect needed here
app.UseCors("VspFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// SignalR hubs
app.MapHub<NotificationHub>("/hubs/notifications");
app.MapHub<AIJobHub>("/hubs/ai-jobs");

app.Run();
