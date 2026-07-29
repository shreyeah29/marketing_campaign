using MediatR;
using VSP.MarketingOS.Application.Interfaces;

namespace VSP.MarketingOS.Application.Commands;

public record GenerateCampaignCommand(
    string Prompt,
    Guid OrganizationId,
    Guid UserId
) : IRequest<CampaignGenerationResult>;

public class GenerateCampaignCommandHandler : IRequestHandler<GenerateCampaignCommand, CampaignGenerationResult>
{
    private readonly ILLMService _llmService;

    public GenerateCampaignCommandHandler(ILLMService llmService)
    {
        _llmService = llmService;
    }

    public async Task<CampaignGenerationResult> Handle(
        GenerateCampaignCommand request,
        CancellationToken cancellationToken)
    {
        return await _llmService.GenerateCampaignAsync(request.Prompt, cancellationToken);
    }
}
