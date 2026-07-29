# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy solution and all project files first (for layer-cached restore)
COPY backend/VSP.MarketingOS.sln ./backend/
COPY backend/src/VSP.MarketingOS.API/VSP.MarketingOS.API.csproj \
     ./backend/src/VSP.MarketingOS.API/
COPY backend/src/VSP.MarketingOS.Application/VSP.MarketingOS.Application.csproj \
     ./backend/src/VSP.MarketingOS.Application/
COPY backend/src/VSP.MarketingOS.Domain/VSP.MarketingOS.Domain.csproj \
     ./backend/src/VSP.MarketingOS.Domain/
COPY backend/src/VSP.MarketingOS.Infrastructure/VSP.MarketingOS.Infrastructure.csproj \
     ./backend/src/VSP.MarketingOS.Infrastructure/

# Restore using the API project directly (avoids .sln backslash path issues on Linux)
RUN dotnet restore backend/src/VSP.MarketingOS.API/VSP.MarketingOS.API.csproj

# Copy all backend source
COPY backend/ ./backend/

# Publish (restore already done above)
RUN dotnet publish backend/src/VSP.MarketingOS.API/VSP.MarketingOS.API.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

# Non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

COPY --from=build /app/publish .

# Render sets PORT=10000 by default; ASP.NET Core reads ASPNETCORE_URLS
ENV ASPNETCORE_URLS=http://+:10000
ENV ASPNETCORE_ENVIRONMENT=Production

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 10000

ENTRYPOINT ["dotnet", "VSP.MarketingOS.API.dll"]
