using Microsoft.EntityFrameworkCore;
using VSP.MarketingOS.Domain.Entities;

namespace VSP.MarketingOS.Infrastructure.Persistence;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Campaign> Campaigns => Set<Campaign>();
    public DbSet<Lead> Leads => Set<Lead>();
    public DbSet<Content> Contents => Set<Content>();
    public DbSet<MarketingImage> Images => Set<MarketingImage>();
    public DbSet<MarketingVideo> Videos => Set<MarketingVideo>();
    public DbSet<SocialPost> SocialPosts => Set<SocialPost>();
    public DbSet<EmailCampaign> EmailCampaigns => Set<EmailCampaign>();
    public DbSet<WhatsAppThread> WhatsAppThreads => Set<WhatsAppThread>();
    public DbSet<VoiceCall> VoiceCalls => Set<VoiceCall>();
    public DbSet<Workflow> Workflows => Set<Workflow>();
    public DbSet<MarketingTemplate> Templates => Set<MarketingTemplate>();
    public DbSet<OrgTask> Tasks => Set<OrgTask>();
    public DbSet<ActivityEvent> Activities => Set<ActivityEvent>();
    public DbSet<OrgSettings> OrgSettings => Set<OrgSettings>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.Name).HasMaxLength(200);
        });

        modelBuilder.Entity<Organization>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(200);
        });

        modelBuilder.Entity<Campaign>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<Lead>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<Content>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<MarketingImage>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<MarketingVideo>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<SocialPost>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<EmailCampaign>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<WhatsAppThread>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<VoiceCall>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<Workflow>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<MarketingTemplate>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<OrgTask>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<ActivityEvent>().HasIndex(x => x.OrganizationId);
        modelBuilder.Entity<OrgSettings>().HasIndex(x => x.OrganizationId).IsUnique();
    }
}
