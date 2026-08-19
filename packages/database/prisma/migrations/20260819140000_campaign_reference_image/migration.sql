-- A poster whose look a campaign should follow.
--
-- Uploaded on the brief screen and stored in our own bucket, so this is a URL we
-- issued rather than an arbitrary address a caller supplied. Held on the
-- campaign rather than per asset: five posters that each borrowed independently
-- would not look like a set.
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "reference_image_url" TEXT;
