-- The product moved to a monochrome design system. Organisations provisioned
-- under the old theme stored its DEFAULT blue/amber as their brand colours,
-- which the white-label override would keep painting over the new look.
-- Clear exactly those defaults; genuinely custom brand colours are kept.
UPDATE "branding" SET "primary_color" = NULL
WHERE lower("primary_color") = '#1e40af';
UPDATE "branding" SET "accent_color" = NULL
WHERE lower("accent_color") = '#d97706';
