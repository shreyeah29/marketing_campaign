namespace VSP.MarketingOS.Application.Interfaces;

/// <summary>
/// Abstraction for image generation (DALL-E, Stable Diffusion, Midjourney API, etc.)
/// </summary>
public interface IImageGenerationService
{
    Task<ImageGenerationResult> GenerateImageAsync(ImageGenerationRequest request, CancellationToken ct = default);
}

public record ImageGenerationRequest(
    string Prompt,
    string Type, // flyer | poster | social | banner | logo | infographic
    int Width = 1080,
    int Height = 1080
);

public record ImageGenerationResult(
    string ImageUrl,
    string? ThumbnailUrl,
    string Title,
    string Type,
    string Size
);
