-- Which kind of picture a concept is, and therefore which model draws it.
--
-- 'POSTER' is a designed layout with words in it, drawn by an image model that
-- can typeset. 'PHOTO' is a photograph, drawn by Runway, which cannot spell and
-- is told never to try.
--
-- Nullable rather than defaulted to 'PHOTO': a null is "created before this
-- existed" and reads as PHOTO at the call site, which is the same behaviour
-- without rewriting a column full of history to say something it never said.
ALTER TABLE "campaign_asset" ADD COLUMN IF NOT EXISTS "visual_style" TEXT;
