namespace VSP.MarketingOS.Domain.Entities;

public class MarketingImage : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Type { get; set; } = "Flyer";
    public string Size { get; set; } = "1080x1080";
    public string Url { get; set; } = string.Empty;
    public string? Prompt { get; set; }
    public bool Liked { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}

public class MarketingVideo : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Type { get; set; } = "Reel";
    public string Status { get; set; } = "ready";
    public string Duration { get; set; } = "0:60";
    public string Script { get; set; } = string.Empty;
    public string? Brief { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}

public class SocialPost : BaseEntity
{
    public string Platform { get; set; } = "Facebook";
    public string Content { get; set; } = string.Empty;
    public string Status { get; set; } = "draft"; // draft | scheduled | published
    public DateTime? ScheduledAt { get; set; }
    public int Engagement { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}

public class EmailCampaign : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Subject { get; set; }
    public string Status { get; set; } = "draft";
    public int Sent { get; set; }
    public double OpenRate { get; set; }
    public double ClickRate { get; set; }
    public int Bounces { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}

public class WhatsAppThread : BaseEntity
{
    public string ContactName { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string LastMessage { get; set; } = string.Empty;
    public int Unread { get; set; }
    public string MessagesJson { get; set; } = "[]";
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}

public class VoiceCall : BaseEntity
{
    public string ContactName { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Status { get; set; } = "queued";
    public string Duration { get; set; } = "—";
    public string Disposition { get; set; } = "Pending";
    public string Summary { get; set; } = string.Empty;
    public string Transcript { get; set; } = string.Empty;
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}

public class Workflow : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = "paused";
    public int Runs { get; set; }
    public int SuccessRate { get; set; } = 100;
    public string StepsJson { get; set; } = "[]";
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}

public class MarketingTemplate : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = "Campaign";
    public int Uses { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}

public class OrgTask : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Due { get; set; } = "Soon";
    public string Priority { get; set; } = "medium";
    public bool Done { get; set; }
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}

public class ActivityEvent : BaseEntity
{
    public string Text { get; set; } = string.Empty;
    public string Status { get; set; } = "new";
    public string Color { get; set; } = "bg-indigo-500";
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}

public class OrgSettings : BaseEntity
{
    public string? Industry { get; set; }
    public string? Website { get; set; }
    public string Timezone { get; set; } = "UTC";
    public string PrimaryColor { get; set; } = "#6366f1";
    public string Tagline { get; set; } = string.Empty;
    public string BrandVoice { get; set; } = string.Empty;
    public string OpenAiKey { get; set; } = string.Empty;
    public string SendGridKey { get; set; } = string.Empty;
    public string TwilioKey { get; set; } = string.Empty;
    public string BlandAiKey { get; set; } = string.Empty;
    public string Plan { get; set; } = "Pro";
    public int Seats { get; set; } = 5;
    public Guid OrganizationId { get; set; }
    public Organization? Organization { get; set; }
}
