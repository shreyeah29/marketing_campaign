-- Words that must appear ON a generated poster, decided per concept.
--
-- The image model is forbidden from drawing text because it cannot spell, and a
-- mangled offer or phone number reaching a customer is worse than no poster. So
-- when a brief asks for a message on the artwork, the generator records the
-- exact words here and the compositor typesets them after the image is stored.
--
-- Nullable and with no default: most pictures carry no message of their own, and
-- an empty object would be indistinguishable from "not asked for".
ALTER TABLE "campaign_asset" ADD COLUMN IF NOT EXISTS "poster_text" JSONB;
