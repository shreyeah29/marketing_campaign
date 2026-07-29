using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace VSP.MarketingOS.API.Hubs;

[Authorize]
public class NotificationHub : Hub
{
    public async Task JoinOrganization(string organizationId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"org-{organizationId}");
    }

    public async Task LeaveOrganization(string organizationId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"org-{organizationId}");
    }
}
