using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using VSP.MarketingOS.Domain.Entities;
using VSP.MarketingOS.Infrastructure.Persistence;

namespace VSP.MarketingOS.Infrastructure.Persistence;

public static class DbSeed
{
    public static async Task EnsureSeededAsync(AppDbContext db)
    {
        await db.Database.EnsureCreatedAsync();

        if (await db.Organizations.AnyAsync()) return;

        var orgId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var userId = Guid.Parse("22222222-2222-2222-2222-222222222222");

        var org = new Organization
        {
            Id = orgId,
            Name = "VSP Law Associates",
            Industry = "Legal Services",
            Website = "https://vsplawassociates.com",
            Plan = "Pro",
            Timezone = "America/Chicago",
        };

        var user = new User
        {
            Id = userId,
            Name = "Sarah Mitchell",
            Email = "sarah@vsplawassociates.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("demo1234"),
            Role = "Admin",
            OrganizationId = orgId,
            LastLoginAt = DateTime.UtcNow,
        };

        db.Organizations.Add(org);
        db.Users.Add(user);
        db.OrgSettings.Add(new OrgSettings
        {
            OrganizationId = orgId,
            Industry = "Legal Services",
            Website = "https://vsplawassociates.com",
            Timezone = "America/Chicago",
            Tagline = "Your Legal Home Away From Home",
            BrandVoice = "Professional, empathetic, authoritative",
            Plan = "Pro",
            Seats = 5,
        });

        db.Campaigns.AddRange(
            new Campaign { Name = "NRI Dallas Facebook Campaign", Channel = "Facebook", Status = "active", Budget = 4500, Spent = 3840, Leads = 72, Conversions = 8, Roi = 320, StartDate = DateTime.UtcNow.AddDays(-28), EndDate = DateTime.UtcNow.AddDays(2), OrganizationId = orgId },
            new Campaign { Name = "Google Search — NRI Legal", Channel = "Google Ads", Status = "active", Budget = 3200, Spent = 2760, Leads = 54, Conversions = 6, Roi = 410, OrganizationId = orgId },
            new Campaign { Name = "Email NRI Welcome Series", Channel = "Email", Status = "active", Budget = 480, Spent = 380, Leads = 30, Conversions = 5, Roi = 820, OrganizationId = orgId }
        );

        db.Leads.AddRange(
            new Lead { Name = "Priya Sharma", Email = "priya@email.com", Company = "Self-employed", Status = "qualified", Score = 87, Value = 15000, Source = "Facebook Ad", Phone = "+1 214-555-0101", OrganizationId = orgId },
            new Lead { Name = "Rajesh Kumar", Email = "rajesh@techcorp.com", Company = "TechCorp Inc", Status = "contacted", Score = 62, Value = 8000, Source = "Google Ad", Phone = "+1 214-555-0102", OrganizationId = orgId },
            new Lead { Name = "Anita Patel", Email = "anita@gmail.com", Company = "Own Business", Status = "new", Score = 45, Value = 12000, Source = "WhatsApp", Phone = "+1 214-555-0103", OrganizationId = orgId }
        );

        db.Contents.Add(new Content { Title = "NRI Property Rights Guide 2024", Type = "blog", Status = "draft", Body = "Draft content...", OrganizationId = orgId });
        db.Images.Add(new MarketingImage { Title = "NRI Legal Flyer", Type = "Flyer", Url = "https://picsum.photos/seed/flyer1/400/400", OrganizationId = orgId });
        db.Videos.Add(new MarketingVideo { Title = "NRI Explainer Reel", Type = "Reel", Status = "ready", Duration = "0:45", Script = "Hook → Problem → Solution → CTA", OrganizationId = orgId });
        db.SocialPosts.Add(new SocialPost { Platform = "Instagram", Content = "5 Legal Documents Every NRI Must Have", Status = "published", Engagement = 342, ScheduledAt = DateTime.UtcNow.AddDays(-1), OrganizationId = orgId });
        db.EmailCampaigns.Add(new EmailCampaign { Name = "NRI Welcome Series", Status = "active", Sent = 1240, OpenRate = 41.2, ClickRate = 12.8, Subject = "Welcome to VSP", OrganizationId = orgId });
        db.WhatsAppThreads.Add(new WhatsAppThread
        {
            ContactName = "Priya Sharma",
            Phone = "+1 214-555-0101",
            LastMessage = "Yes, I need a POA for my Mumbai flat",
            Unread = 2,
            MessagesJson = JsonSerializer.Serialize(new[]
            {
                new { id = "m1", from = "them", text = "Hi, I saw your NRI legal ad", at = "10:01 AM" },
                new { id = "m2", from = "us", text = "Namaste! Happy to help.", at = "10:02 AM" },
                new { id = "m3", from = "them", text = "Yes, I need a POA for my Mumbai flat", at = "10:05 AM" },
            }),
            OrganizationId = orgId,
        });
        db.VoiceCalls.Add(new VoiceCall { ContactName = "Priya Sharma", Phone = "+1 214-555-0101", Status = "completed", Duration = "4:32", Disposition = "Appointment Booked", Summary = "Interested in POA. Booked consultation.", Transcript = "AI: Hello Priya...", OrganizationId = orgId });
        db.Workflows.Add(new Workflow { Name = "Lead → Email → WhatsApp → Call", Status = "active", Runs = 142, SuccessRate = 94, StepsJson = JsonSerializer.Serialize(new[] { "Lead Created", "Send Email", "Wait 2d", "Send WhatsApp", "Schedule AI Call" }), OrganizationId = orgId });
        db.Templates.Add(new MarketingTemplate { Name = "NRI Lead Gen Pack", Category = "Campaign", Uses = 48, OrganizationId = orgId });
        db.Tasks.Add(new OrgTask { Title = "Review Facebook ad creative for Q3", Due = "Today, 3:00 PM", Priority = "high", OrganizationId = orgId });
        db.Activities.Add(new ActivityEvent { Text = "Demo workspace seeded for VSP Law Associates", Status = "complete", Color = "bg-indigo-500", OrganizationId = orgId });

        await db.SaveChangesAsync();
    }
}

public static class ClaimPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        var raw = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(raw, out var id) ? id : Guid.Empty;
    }

    public static Guid GetOrganizationId(this ClaimsPrincipal user)
    {
        var raw = user.FindFirstValue("org_id");
        return Guid.TryParse(raw, out var id) ? id : Guid.Empty;
    }
}
