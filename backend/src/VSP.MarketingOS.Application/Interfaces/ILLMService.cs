namespace VSP.MarketingOS.Application.Interfaces;

/// <summary>
/// Abstraction layer for LLM/AI text generation.
/// Replace MockLLMService with real implementation (OpenAI, Anthropic, Azure OpenAI)
/// by changing only the DI registration in Program.cs — NO UI/API changes needed.
/// </summary>
public interface ILLMService
{
    Task<CampaignGenerationResult> GenerateCampaignAsync(string prompt, CancellationToken ct = default);
    Task<string> GenerateContentAsync(string type, string brief, CancellationToken ct = default);
    Task<IEnumerable<string>> GenerateInsightsAsync(string context, CancellationToken ct = default);
    Task<string> ChatCompletionAsync(IEnumerable<ChatMessage> messages, CancellationToken ct = default);
}

public record ChatMessage(string Role, string Content);

public record CampaignSection(string Id, string Title, string Type, string Content);

public record CampaignGenerationResult(
    string Summary,
    IEnumerable<CampaignSection> Sections
);
