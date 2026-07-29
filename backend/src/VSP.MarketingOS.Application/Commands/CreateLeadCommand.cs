using MediatR;
using VSP.MarketingOS.Domain.Entities;

namespace VSP.MarketingOS.Application.Commands;

public record CreateLeadCommand(
    string Name,
    string Email,
    string? Phone,
    string? Company,
    string? Source,
    Guid OrganizationId
) : IRequest<Guid>;

public class CreateLeadCommandHandler : IRequestHandler<CreateLeadCommand, Guid>
{
    public async Task<Guid> Handle(CreateLeadCommand request, CancellationToken cancellationToken)
    {
        var lead = new Lead
        {
            Name = request.Name,
            Email = request.Email,
            Phone = request.Phone,
            Company = request.Company,
            Source = request.Source,
            OrganizationId = request.OrganizationId,
            Status = "new",
            Score = 50,
        };
        // TODO: persist via IApplicationDbContext
        await Task.CompletedTask;
        return lead.Id;
    }
}
