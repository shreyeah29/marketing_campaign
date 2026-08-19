# Direction sample pictures

One picture per AI creative direction, named `<direction-id>.png` — `ai-premium.png`,
`tf-cinematic.png`, and so on. Ids come from
`apps/api/src/modules/ai/creative-directions.ts`.

## Why these are files and not generated

They were generated into object storage by an operator button, once per
deployment. That worked and was still wrong in four ways:

- it cost a set of images every time a fresh environment came up
- staging and production ended up with different pictures for the same card
- a deployment that had never pressed the button showed blank cards
- and nothing showed at all until an OpenAI key was configured

A sample is a fixed property of a direction, the same way the layout of a
template is. It belongs beside the code that defines the direction, not in a
bucket that varies per environment.

## Why every one shows the same subject

A coffee cup on a plain surface, in all of them. The gallery exists so someone
can compare _styles_; a row where the subject changes as well tells you nothing
about either. Same subject, different treatment — the only variable is the one
being chosen.

No text in any of them. A sample with words on it gets judged on its spelling
rather than its style, and these are chosen at thumbnail size where words are
illegible anyway.

## What they are used for

Two things, and the second is the important one:

1. The picture on the card.
2. **The style reference for what you generate.** Picking a direction sends this
   image to the generator alongside the brief, so the instruction is "make it
   look like this" rather than a paragraph of adjectives. The poster brief takes
   its visual language and none of its content, which is why a picture of a
   coffee cup can direct a festival poster without a cup appearing in it.

## Adding or replacing one

They are genuine output of the real pipeline, not stock artwork — a card must
show what its direction actually produces.

1. Platform console → **Generate the direction previews**. Draws anything that
   has no picture yet, using the same prompt every card is described by.
2. `node scripts/fetch-direction-previews.mjs` — downloads the set into this
   folder.
3. Commit them. That direction is now fixed everywhere and costs nothing again.

Step 1 is authoring, not operations. Once a direction's picture is committed
here, nothing generates it again.
