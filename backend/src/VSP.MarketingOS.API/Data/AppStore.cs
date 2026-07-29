namespace VSP.MarketingOS.API.Data;

/// <summary>
/// In-memory store so create/update/list actions persist for the life of the process.
/// Swap for EF Core + Azure SQL later — controllers stay the same.
/// </summary>
public static class AppStore
{
    private static readonly object Lock = new();

    public static List<Dictionary<string, object?>> Campaigns { get; } = new()
    {
        new() { ["id"] = "1", ["name"] = "NRI Dallas Facebook Campaign", ["channel"] = "Facebook", ["status"] = "active", ["budget"] = 4500m, ["spent"] = 3840m, ["leads"] = 72, ["conversions"] = 8, ["roi"] = 320, ["start"] = "Jul 1", ["end"] = "Jul 31" },
        new() { ["id"] = "2", ["name"] = "Google Search — NRI Legal", ["channel"] = "Google Ads", ["status"] = "active", ["budget"] = 3200m, ["spent"] = 2760m, ["leads"] = 54, ["conversions"] = 6, ["roi"] = 410, ["start"] = "Jul 5", ["end"] = "Aug 5" },
        new() { ["id"] = "3", ["name"] = "LinkedIn NRI Thought Leadership", ["channel"] = "LinkedIn", ["status"] = "active", ["budget"] = 2000m, ["spent"] = 1560m, ["leads"] = 24, ["conversions"] = 4, ["roi"] = 280, ["start"] = "Jul 10", ["end"] = "Aug 10" },
        new() { ["id"] = "4", ["name"] = "Email NRI Welcome Series", ["channel"] = "Email", ["status"] = "active", ["budget"] = 480m, ["spent"] = 380m, ["leads"] = 30, ["conversions"] = 5, ["roi"] = 820, ["start"] = "Jul 1", ["end"] = "Ongoing" },
        new() { ["id"] = "5", ["name"] = "Instagram NRI Awareness", ["channel"] = "Instagram", ["status"] = "paused", ["budget"] = 1500m, ["spent"] = 890m, ["leads"] = 28, ["conversions"] = 2, ["roi"] = 180, ["start"] = "Jun 20", ["end"] = "Jul 20" },
        new() { ["id"] = "6", ["name"] = "WhatsApp Broadcast — NRI", ["channel"] = "WhatsApp", ["status"] = "active", ["budget"] = 800m, ["spent"] = 620m, ["leads"] = 40, ["conversions"] = 7, ["roi"] = 650, ["start"] = "Jul 15", ["end"] = "Aug 15" },
        new() { ["id"] = "7", ["name"] = "YouTube Explainer Video", ["channel"] = "YouTube", ["status"] = "draft", ["budget"] = 2000m, ["spent"] = 0m, ["leads"] = 0, ["conversions"] = 0, ["roi"] = 0, ["start"] = "Aug 1", ["end"] = "Aug 31" },
    };

    public static List<Dictionary<string, object?>> Leads { get; } = new()
    {
        new() { ["id"] = "1", ["name"] = "Priya Sharma", ["email"] = "priya@email.com", ["company"] = "Self-employed", ["status"] = "qualified", ["score"] = 87, ["value"] = 15000, ["source"] = "Facebook Ad", ["date"] = "Jul 29", ["phone"] = "+1 214-555-0101" },
        new() { ["id"] = "2", ["name"] = "Rajesh Kumar", ["email"] = "rajesh@techcorp.com", ["company"] = "TechCorp Inc", ["status"] = "contacted", ["score"] = 62, ["value"] = 8000, ["source"] = "Google Ad", ["date"] = "Jul 28", ["phone"] = "+1 214-555-0102" },
        new() { ["id"] = "3", ["name"] = "Anita Patel", ["email"] = "anita@gmail.com", ["company"] = "Own Business", ["status"] = "new", ["score"] = 45, ["value"] = 12000, ["source"] = "WhatsApp", ["date"] = "Jul 29", ["phone"] = "+1 214-555-0103" },
        new() { ["id"] = "4", ["name"] = "Suresh Mehta", ["email"] = "suresh@gmail.com", ["company"] = "Mehta Consulting", ["status"] = "proposal", ["score"] = 91, ["value"] = 25000, ["source"] = "Referral", ["date"] = "Jul 27", ["phone"] = "+1 214-555-0104" },
        new() { ["id"] = "5", ["name"] = "Deepa Nair", ["email"] = "deepa@nair.in", ["company"] = "Nair Family Trust", ["status"] = "won", ["score"] = 100, ["value"] = 18000, ["source"] = "LinkedIn", ["date"] = "Jul 25", ["phone"] = "+1 214-555-0105" },
    };

    public static List<Dictionary<string, object?>> ContentDrafts { get; } = new()
    {
        new() { ["id"] = "1", ["title"] = "NRI Property Rights Guide 2024", ["type"] = "blog", ["status"] = "draft", ["content"] = "Draft content...", ["date"] = "2h ago" },
        new() { ["id"] = "2", ["title"] = "Welcome Email — NRI Series", ["type"] = "email", ["status"] = "saved", ["content"] = "Email draft...", ["date"] = "5h ago" },
        new() { ["id"] = "3", ["title"] = "VSP Dallas Landing Page", ["type"] = "landing", ["status"] = "published", ["content"] = "Landing page...", ["date"] = "Yesterday" },
    };

    public static List<Dictionary<string, object?>> Images { get; } = new()
    {
        new() { ["id"] = "1", ["title"] = "NRI Legal Flyer", ["type"] = "Flyer", ["size"] = "1080x1080", ["url"] = "https://picsum.photos/seed/flyer1/400/400", ["liked"] = false },
        new() { ["id"] = "2", ["title"] = "VSP Law Poster", ["type"] = "Poster", ["size"] = "1080x1920", ["url"] = "https://picsum.photos/seed/poster1/300/500", ["liked"] = true },
        new() { ["id"] = "3", ["title"] = "Social Campaign Post", ["type"] = "Social Post", ["size"] = "1080x1080", ["url"] = "https://picsum.photos/seed/social1/400/400", ["liked"] = false },
        new() { ["id"] = "4", ["title"] = "LinkedIn Banner", ["type"] = "Banner", ["size"] = "1584x396", ["url"] = "https://picsum.photos/seed/banner1/600/150", ["liked"] = false },
        new() { ["id"] = "5", ["title"] = "NRI Infographic", ["type"] = "Infographic", ["size"] = "800x2000", ["url"] = "https://picsum.photos/seed/info1/300/750", ["liked"] = true },
        new() { ["id"] = "6", ["title"] = "Brand Logo", ["type"] = "Logo", ["size"] = "512x512", ["url"] = "https://picsum.photos/seed/logo1/400/400", ["liked"] = false },
    };

    public static List<Dictionary<string, object?>> Videos { get; } = new()
    {
        new() { ["id"] = "1", ["title"] = "NRI Explainer Reel", ["type"] = "Reel", ["status"] = "ready", ["duration"] = "0:45", ["script"] = "Hook → Problem → Solution → CTA" },
        new() { ["id"] = "2", ["title"] = "Property Protection Demo", ["type"] = "Product Demo", ["status"] = "rendering", ["duration"] = "2:10", ["script"] = "Demo walkthrough..." },
        new() { ["id"] = "3", ["title"] = "Client Testimonial", ["type"] = "YouTube", ["status"] = "draft", ["duration"] = "3:00", ["script"] = "Interview style..." },
    };

    public static List<Dictionary<string, object?>> SocialPosts { get; } = new()
    {
        new() { ["id"] = "1", ["platform"] = "Facebook", ["content"] = "NRI Legal Experts in Dallas — Book free consultation", ["status"] = "scheduled", ["scheduledAt"] = "2026-07-30T10:00:00Z", ["engagement"] = 128 },
        new() { ["id"] = "2", ["platform"] = "Instagram", ["content"] = "5 Legal Documents Every NRI Must Have 🇮🇳", ["status"] = "published", ["scheduledAt"] = "2026-07-28T14:00:00Z", ["engagement"] = 342 },
        new() { ["id"] = "3", ["platform"] = "LinkedIn", ["content"] = "Thought leadership: Property rights for NRIs", ["status"] = "draft", ["scheduledAt"] = null, ["engagement"] = 0 },
        new() { ["id"] = "4", ["platform"] = "X", ["content"] = "Remote POA from USA to India — how it works", ["status"] = "scheduled", ["scheduledAt"] = "2026-07-31T09:00:00Z", ["engagement"] = 0 },
    };

    public static List<Dictionary<string, object?>> EmailCampaigns { get; } = new()
    {
        new() { ["id"] = "1", ["name"] = "NRI Welcome Series", ["status"] = "active", ["sent"] = 1240, ["openRate"] = 41.2, ["clickRate"] = 12.8, ["bounces"] = 18 },
        new() { ["id"] = "2", ["name"] = "Property Checklist Lead Magnet", ["status"] = "active", ["sent"] = 890, ["openRate"] = 48.5, ["clickRate"] = 18.2, ["bounces"] = 9 },
        new() { ["id"] = "3", ["name"] = "July Newsletter", ["status"] = "paused", ["sent"] = 2100, ["openRate"] = 32.1, ["clickRate"] = 7.4, ["bounces"] = 41 },
    };

    public static List<Dictionary<string, object?>> EmailSequences { get; } = new()
    {
        new() { ["id"] = "1", ["name"] = "5-Part Welcome", ["steps"] = 5, ["active"] = true, ["subscribers"] = 340 },
        new() { ["id"] = "2", ["name"] = "Consultation Nurture", ["steps"] = 4, ["active"] = true, ["subscribers"] = 128 },
    };

    public static List<Dictionary<string, object?>> WhatsAppConversations { get; } = new()
    {
        new()
        {
            ["id"] = "1", ["name"] = "Priya Sharma", ["phone"] = "+1 214-555-0101", ["unread"] = 2, ["lastMessage"] = "Yes, I need a POA for my Mumbai flat", ["lastAt"] = "2m ago",
            ["messages"] = new List<object>
            {
                new { id = "m1", from = "them", text = "Hi, I saw your NRI legal ad", at = "10:01 AM" },
                new { id = "m2", from = "us", text = "Namaste! Happy to help. Do you need POA or property dispute support?", at = "10:02 AM" },
                new { id = "m3", from = "them", text = "Yes, I need a POA for my Mumbai flat", at = "10:05 AM" },
            }
        },
        new()
        {
            ["id"] = "2", ["name"] = "Rajesh Kumar", ["phone"] = "+1 214-555-0102", ["unread"] = 0, ["lastMessage"] = "Thanks, booked the consultation", ["lastAt"] = "1h ago",
            ["messages"] = new List<object>
            {
                new { id = "m1", from = "us", text = "Your free consultation is available tomorrow 3pm CST", at = "9:00 AM" },
                new { id = "m2", from = "them", text = "Thanks, booked the consultation", at = "9:12 AM" },
            }
        },
    };

    public static List<Dictionary<string, object?>> VoiceCalls { get; } = new()
    {
        new() { ["id"] = "1", ["name"] = "Priya Sharma", ["phone"] = "+1 214-555-0101", ["status"] = "completed", ["duration"] = "4:32", ["disposition"] = "Appointment Booked", ["summary"] = "Interested in POA for Mumbai property. Booked consultation Jul 30.", ["transcript"] = "AI: Hello Priya...\nCaller: I need help with power of attorney..." },
        new() { ["id"] = "2", ["name"] = "Rajesh Kumar", ["phone"] = "+1 214-555-0102", ["status"] = "missed", ["duration"] = "0:00", ["disposition"] = "No Answer", ["summary"] = "No pickup — scheduled retry.", ["transcript"] = "" },
        new() { ["id"] = "3", ["name"] = "Anita Patel", ["phone"] = "+1 214-555-0103", ["status"] = "queued", ["duration"] = "—", ["disposition"] = "Pending", ["summary"] = "Queued for outbound AI call.", ["transcript"] = "" },
    };

    public static List<Dictionary<string, object?>> Workflows { get; } = new()
    {
        new() { ["id"] = "1", ["name"] = "Lead → Email → WhatsApp → Call", ["status"] = "active", ["runs"] = 142, ["successRate"] = 94, ["steps"] = new[] { "Lead Created", "Send Email", "Wait 2d", "Send WhatsApp", "Schedule AI Call", "Update CRM" } },
        new() { ["id"] = "2", ["name"] = "Missed Call Follow-up", ["status"] = "active", ["runs"] = 67, ["successRate"] = 88, ["steps"] = new[] { "Missed Call", "Wait 15m", "Send SMS", "WhatsApp Reminder" } },
        new() { ["id"] = "3", ["name"] = "Campaign Launch Checklist", ["status"] = "paused", ["runs"] = 12, ["successRate"] = 100, ["steps"] = new[] { "Campaign Created", "Notify Team", "Create Tasks" } },
    };

    public static List<Dictionary<string, object?>> WorkflowExecutions { get; } = new()
    {
        new() { ["id"] = "e1", ["workflow"] = "Lead → Email → WhatsApp → Call", ["status"] = "success", ["at"] = "2m ago", ["detail"] = "Priya Sharma — Email sent, WhatsApp queued" },
        new() { ["id"] = "e2", ["workflow"] = "Missed Call Follow-up", ["status"] = "running", ["at"] = "8m ago", ["detail"] = "Rajesh Kumar — Waiting 15m" },
        new() { ["id"] = "e3", ["workflow"] = "Lead → Email → WhatsApp → Call", ["status"] = "failed", ["at"] = "1h ago", ["detail"] = "Invalid WhatsApp template approval" },
    };

    public static List<Dictionary<string, object?>> Templates { get; } = new()
    {
        new() { ["id"] = "1", ["name"] = "NRI Lead Gen Pack", ["category"] = "Campaign", ["uses"] = 48 },
        new() { ["id"] = "2", ["name"] = "Email Welcome Sequence", ["category"] = "Email", ["uses"] = 112 },
        new() { ["id"] = "3", ["name"] = "Social Carousel — Legal Tips", ["category"] = "Social", ["uses"] = 76 },
        new() { ["id"] = "4", ["name"] = "WhatsApp Appointment Reminder", ["category"] = "WhatsApp", ["uses"] = 210 },
    };

    public static List<Dictionary<string, object?>> Tasks { get; } = new()
    {
        new() { ["id"] = "1", ["task"] = "Review Facebook ad creative for Q3", ["due"] = "Today, 3:00 PM", ["priority"] = "high", ["done"] = false },
        new() { ["id"] = "2", ["task"] = "Approve WhatsApp template for NRI campaign", ["due"] = "Tomorrow, 10:00 AM", ["priority"] = "medium", ["done"] = false },
        new() { ["id"] = "3", ["task"] = "Monthly analytics review call", ["due"] = "Aug 1, 11:00 AM", ["priority"] = "low", ["done"] = false },
        new() { ["id"] = "4", ["task"] = "Launch Google Ads NRI retargeting", ["due"] = "Aug 2", ["priority"] = "high", ["done"] = false },
    };

    public static List<Dictionary<string, object?>> Activity { get; } = new()
    {
        new() { ["id"] = "1", ["text"] = "Priya Sharma submitted NRI consultation form", ["time"] = "2m ago", ["status"] = "new", ["color"] = "bg-emerald-500" },
        new() { ["id"] = "2", ["text"] = "AI generated 14-section campaign for VSP Dallas", ["time"] = "18m ago", ["status"] = "complete", ["color"] = "bg-indigo-500" },
        new() { ["id"] = "3", ["text"] = "Email sequence \"NRI Welcome\" started for 45 contacts", ["time"] = "1h ago", ["status"] = "active", ["color"] = "bg-cyan-500" },
        new() { ["id"] = "4", ["text"] = "Facebook campaign \"NRI Legal Dallas\" went live", ["time"] = "2h ago", ["status"] = "live", ["color"] = "bg-violet-500" },
        new() { ["id"] = "5", ["text"] = "AI Voice call with Rajesh Kumar — Appointment booked", ["time"] = "3h ago", ["status"] = "complete", ["color"] = "bg-white/20" },
    };

    public static Dictionary<string, object?> Settings { get; } = new()
    {
        ["organization"] = new Dictionary<string, object?>
        {
            ["name"] = "VSP Law Associates",
            ["website"] = "https://vsplawassociates.com",
            ["industry"] = "Legal Services",
            ["timezone"] = "America/Chicago",
        },
        ["brand"] = new Dictionary<string, object?>
        {
            ["primaryColor"] = "#6366f1",
            ["tagline"] = "Your Legal Home Away From Home",
            ["voice"] = "Professional, empathetic, authoritative",
        },
        ["apiKeys"] = new Dictionary<string, object?>
        {
            ["openai"] = "",
            ["sendgrid"] = "",
            ["twilio"] = "",
            ["blandai"] = "",
        },
        ["billing"] = new Dictionary<string, object?>
        {
            ["plan"] = "Pro",
            ["seats"] = 4,
            ["renewsAt"] = "2026-08-29",
            ["amount"] = 299,
        },
    };

    public static string NewId() => Guid.NewGuid().ToString("N")[..8];

    public static void Lock(Action action)
    {
        lock (Lock) action();
    }
}
