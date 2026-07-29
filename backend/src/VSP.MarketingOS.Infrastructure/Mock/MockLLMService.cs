using VSP.MarketingOS.Application.Interfaces;

namespace VSP.MarketingOS.Infrastructure.Mock;

/// <summary>
/// Mock LLM Service — returns realistic pre-built responses.
/// Replace with OpenAILLMService or AnthropicLLMService by changing DI registration ONLY.
/// </summary>
public class MockLLMService : ILLMService
{
    public async Task<CampaignGenerationResult> GenerateCampaignAsync(string prompt, CancellationToken ct = default)
    {
        await Task.Delay(100, ct); // Simulate network latency

        var sections = new List<CampaignSection>
        {
            new("strategy", "Campaign Strategy", "strategy",
                $"**Campaign Name:** Based on your prompt: \"{prompt}\"\n\n**Objective:** Generate 150+ qualified leads per month.\n\n**Duration:** 90-day sprint with ongoing evergreen campaigns.\n\n**Budget Allocation:** $15,000/month total across all channels"),

            new("audience", "Target Audience", "audience",
                "**Primary Segment:** High-intent prospects aged 30-55\n\n**Demographics:**\n- Income: $100K–$300K household\n- Profession: Professionals, business owners\n\n**Pain Points:**\n1. Need trusted expertise\n2. Time constraints\n3. Looking for results-driven partner"),

            new("facebook", "Facebook Ads", "social",
                "**Campaign 1: Lead Generation**\nHeadline: \"Expert Services — Get Free 30-Min Consultation\"\nBody: \"Trusted by 500+ clients. Professional team. Book your free consultation today.\"\nCTA: Book Free Consultation"),

            new("email", "Email Sequence", "email",
                "**5-Part Welcome Sequence:**\n\nEmail 1 (Day 0): Welcome + Free Resource\nEmail 2 (Day 2): Educational Value Bomb\nEmail 3 (Day 5): Case Study\nEmail 4 (Day 8): FAQ + Authority\nEmail 5 (Day 12): CTA — Book Consultation"),

            new("seo", "SEO Suggestions", "seo",
                "**Primary Keywords:**\n- [Service] near me (590 searches/mo)\n- Best [service] professionals (880 searches/mo)\n\n**Content Velocity:** 2 blog posts/week for first 3 months"),

            new("cta", "CTA Strategy", "cta",
                "**Primary CTAs:**\n1. \"Book Free 30-Min Consultation\" — Primary button\n2. \"WhatsApp Us Now\" — Floating button\n3. \"Download Free Guide\" — Lead magnet"),
        };

        return new CampaignGenerationResult(
            $"360° marketing campaign generated for: {prompt}",
            sections
        );
    }

    public async Task<string> GenerateContentAsync(string type, string brief, CancellationToken ct = default)
    {
        await Task.Delay(50, ct);
        return $"# Generated {type} Content\n\nBrief: {brief}\n\nThis is AI-generated content for your {type}. Replace this mock service with your preferred LLM provider (OpenAI, Anthropic, Azure OpenAI) by registering the real implementation in Program.cs.";
    }

    public async Task<IEnumerable<string>> GenerateInsightsAsync(string context, CancellationToken ct = default)
    {
        await Task.Delay(50, ct);
        return new[]
        {
            "LinkedIn campaigns showing 34% higher lead quality — consider reallocating budget",
            "Email open rates peak Tuesday 10am and Thursday 2pm",
            "Mobile traffic is 68% but only 31% of conversions — UX optimization opportunity",
            "Top segment has 3.2x higher LTV — deserves dedicated nurture track",
        };
    }

    public async Task<string> ChatCompletionAsync(IEnumerable<ChatMessage> messages, CancellationToken ct = default)
    {
        await Task.Delay(50, ct);
        var last = messages.LastOrDefault();
        return $"I understand your question about: \"{last?.Content}\". As a mock AI service, I'm providing a placeholder response. Connect a real LLM API (OpenAI, Anthropic) by updating the DI registration in Program.cs.";
    }
}
