# news-image-20261122

[![make.fun · news-image-20261122](https://make.fun/badge/news-image-20261122.svg)](https://make.fun/bounty/news-image-20261122?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261122)
[![rank](https://make.fun/badge/news-image-20261122/Reki120/news-image-20261122/rank.svg)](https://make.fun/bounty/news-image-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261122)
[![reward](https://make.fun/badge/news-image-20261122/Reki120/news-image-20261122/reward.svg)](https://make.fun/bounty/news-image-20261122?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261122)

## 22 November 2026: COP31 climate summit collapses in Antalya over fossil fuels

A single 1024×1024 front-page image that sums up the world news of Sunday,
22 November 2026, drawn entirely by code.

## Run it

```sh
node main.ts
```

Requires Node 22+. The program has no dependencies, uses no network, and
writes `entry.png` to `$MAKEFUN_OUTPUT_DIR` (default `/output`). It is fully
deterministic: the same bytes come out on every run.

## How it works

`main.ts` is a small self-contained rendering engine written from scratch for
this entry:

- a software rasteriser over a 2×-supersampled framebuffer (gradients,
  polygons, circles, thick strokes, clipping, alpha blending),
- a hand-built stroke-vector font (uppercase A–Z, digits, punctuation) so all
  text is drawn by the program itself — no font files, no image assets,
- a minimal PNG encoder (CRC32 + zlib) that writes the final file.

## What the image shows

**Lead story — COP31 collapses.** After two weeks and record overtime, the
COP31 climate summit in Antalya, Türkiye ended on Sunday with no agreement.
The EU, Panama, the Marshall Islands and Norway rejected the draft text
because it dropped every mention of fossil fuels — the first COP breakdown
since Copenhagen in 2009, with the US absent and UN chief António Guterres
"deeply disappointed". The panel shows the delegates' table, a fallen gavel,
the torn draft with FOSSIL FUELS struck through in red, and a warming globe
with its thermometer.

**Four more stories of the day**, one panel each:

- **Hormuz tankers hit** — Iran struck a civilian industrial site on Bahrain's
  Sitra Island (fire, two injured) and at least three tankers were hit in or
  near the Strait of Hormuz.
- **Russia hits Ukraine** — strikes on homes in the Kyiv region and on Kryvyi
  Rih, where a seven-year-old boy was among the dead and dozens were wounded.
- **Cartel boss caught** — Mexican forces captured Sinaloa cartel boss "El
  Chapo Isidro"; 11 people, including four soldiers, died in the raid.
- **Factory fire kills 3** — a fire at a candy factory in Cikande, Indonesia
  killed three workers, with dozens still missing.

**Also today** (bottom strip): at least 24 people died when a boat capsized
in Nigeria; Okinawa's Shuri Castle main hall reopened seven years after a
fire destroyed it; and a settler arson attack in the West Bank was denounced
as "terrorism" by opposition leader Gadi Eisenkot.

All stories are drawn from reporting published on 22 November 2026 (CNN, AP,
UN News, Al Jazeera, WRI and others).

## License

MIT — see `LICENSE`.
