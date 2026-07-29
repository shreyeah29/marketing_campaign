namespace VSP.MarketingOS.Application.Interfaces;

/// <summary>
/// Voice AI abstraction (Twilio, ElevenLabs, Bland AI, Retell AI, etc.)
/// </summary>
public interface IVoiceService
{
    Task<CallResult> InitiateCallAsync(CallRequest request, CancellationToken ct = default);
    Task<CallTranscript> GetTranscriptAsync(string callId, CancellationToken ct = default);
    Task<IEnumerable<CallRecord>> GetCallHistoryAsync(string organizationId, CancellationToken ct = default);
}

public record CallRequest(
    string ToPhone,
    string FromPhone,
    string ScriptId,
    string AgentName = "Aria"
);

public record CallResult(
    string CallId,
    string Status,
    DateTime InitiatedAt
);

public record CallTranscript(
    string CallId,
    string FullTranscript,
    string AiSummary,
    string Disposition,
    int DurationSeconds
);

public record CallRecord(
    string CallId,
    string ContactName,
    string Phone,
    string Status,
    string Disposition,
    DateTime CreatedAt,
    int DurationSeconds
);
