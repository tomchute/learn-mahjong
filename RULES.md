# Ruleset

This app implements Hong Kong–style mahjong as described in *Tea Base's
Mahjong Instruction Booklet*, with the interpretation decisions documented
here.

## Structure

- 144 tiles: Circles/Bamboo/Characters 1–9 (×4), four winds (×4), three
  dragons (×4), 8 flower tiles.
- 13-tile hands (dealer 14). Flowers are exposed on draw and replaced from the
  **back** of the wall.
- Win = 4 sets (runs or triplets) + a pair — or seven pairs, thirteen orphans,
  or all eight flowers.
- Turn order is counter-clockwise. **Seung (chow)** may only be claimed from
  the player immediately before you; **pong/gong/win** from anyone. Claim
  priority: win > pong/gong > seung; among multiple winners, the nearest in
  turn order takes it.
- A match is 4 rounds (E/S/W/N). The dealer repeats on a dealer win **or a
  drawn hand**; otherwise the deal passes counter-clockwise. When the deal
  returns to the round's starting player, the round wind advances. Minimum 16
  hands.
- Payments: loser-pays model from the booklet — on a discard win only the
  discarder pays; on self-draw (and eight flowers) all three opponents pay.
  Payout per payer = 2^fan chips, capped at the 13-fan limit (8192).

## Fan table (as implemented)

| Fan | Hand |
|-----|------|
| 1 | Common hand (all runs, non-honour eyes) · concealed hand · self-draw · dragon pong/gong · **seat**-wind pong/gong · each gong · seat flower · no flowers · robbing the gong · win after gong · last-tile win · mixed terminals |
| 2 | Full flower set (all 4 of one group) |
| 3 | All triplets · mixed one suit |
| 5 | Small dragons |
| 6 | Small winds |
| 7 | Pure one suit · seven pairs |
| 8 | Great dragons · gong-on-gong win · all eight flowers (instant win) · concealed all triplets |
| 10 | All honours · pure terminals |
| 13 (limit, non-stacking) | Heavenly hand · earthly hand · great winds · thirteen orphans |

All fan stack except the 13-fan limit hands. When "concealed all triplets"
applies, the subsumed "all triplets" and "concealed hand" fans are not
double-counted; likewise "all honours"/"pure terminals" subsume "all
triplets" stacking is suppressed for the pong fan only where noted in code.

## Interpretation decisions

The booklet is a community teaching document, so a few points needed
interpretation. Decisions made:

1. **Honour eyes** — the booklet says a hand with wind/dragon eyes
  "automatically becomes 0 fan". Read literally this would break Small
  Dragons / Small Winds (which require honour eyes). Implemented as the
  standard HK reading: honour eyes disqualify the **common hand (ping wu)**
  fan, so a plain all-runs hand with honour eyes scores 0 — named hands are
  unaffected.
2. **Wind sets** — only the booklet's listed cases score: dragons always,
  winds only when they match your **seat**. (The booklet does not score the
  round wind, so neither do we.)
3. **Seat flowers** — seats are numbered from the dealer (East=1 … North=4);
  a flower matching your seat number scores 1 fan from either flower group
  (so two are possible), matching "the number should correspond to your
  seat".
4. **Chicken hand** — 0 fan is a legal win and pays 2^0 = 1 chip.
5. **Robbing the gong** applies to added (exposed) gongs. Robbing a
  *concealed* gong is not implemented (some tables allow it for thirteen
  orphans only).
5b. **Gong & self-draw timing** — declaring a gong (concealed or added) and
  declaring a self-draw win both require an actual draw this turn, or the
  dealer's untouched opening hand. A turn gained by claiming a pong/seung
  grants no draw: you must simply discard. (Without this, a claim could be
  laundered into a "self-draw" or into a gong's free replacement tile.)
5c. **No gong with an empty wall** — a gong requires a replacement tile, so
  none may be declared (or claimed from a discard) once the wall is empty.
  Standard table rule; it also prevents a gong from ending the hand early
  and skipping the final discard's claim window.
6. **Eight flowers** — instant 8-fan win the moment the 8th flower is drawn;
  paid by all three opponents like a self-draw.
7. **Heavenly hand** — dealer's opening 14 tiles are a win (no discard made).
  **Earthly hand** — a non-dealer wins on the dealer's very first discard.
8. Starting stacks are 500 chips; chips can go negative (scores are for
  learning, not survival).
