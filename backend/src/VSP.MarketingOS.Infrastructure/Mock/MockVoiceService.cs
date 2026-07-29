using VSP.MarketingOS.Application.Interfaces;

namespace VSP.MarketingOS.Infrastructure.Mock;

public class MockVoiceService : IVoiceService
{
    public async Task<CallResult> InitiateCallAsync(CallRequest request, CancellationToken ct = default)
    {
        await Task.Delay(10, ct);
        return new CallResult(Guid.NewGuid().ToString(), "initiated", DateTime.UtcNow);
    }

    public async Task<CallTranscript> GetTranscriptAsync(string callId, CancellationToken ct = default)
    {
        await Task.Delay(10, ct);
        return new CallTranscript(
            callId,
            "AI: Hello, may I speak with the prospect?\nProspect: Yes, speaking.\nAI: Hi, this is Aria from VSP Law Associates...",
            "Prospect expressed interest in NRI property services. Appointment booked for next week.",
            "Appointment Booked",
            522
        );
    }

    public async Task<IEnumerable<CallRecord>> GetCallHistoryAsync(string organizationId, CancellationToken ct = default)
    {
        await Task.Delay(10, ct);
        return new[]
        {
            new CallRecord(Guid.NewGuid().ToString(), "Priya Sharma", "+1 469 555 0123", "completed", "Appointment Booked", DateTime.UtcNow.AddHours(-1), 522),
            new CallRecord(Guid.NewGuid().ToString(), "Rajesh Kumar", "+1 214 555 0456", "completed", "Callback Requested", DateTime.UtcNow.AddHours(-3), 318),
        };
    }
}
