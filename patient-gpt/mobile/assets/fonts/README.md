# Bundled fonts

The three families the prototype loads (`docs/design/patient-chat.html`), bundled
so the app never fetches fonts at runtime. All three are variable fonts on the
`wght` axis; `lib/core/theme/pg_text.dart` sets the weight through
`FontVariation`.

| File | Family | Source | License |
|---|---|---|---|
| `PlayfairDisplay-Variable.ttf` | Playfair Display (wght 400–900) | `ofl/playfairdisplay/PlayfairDisplay[wght].ttf` | SIL OFL 1.1, `OFL-PlayfairDisplay.txt` (Reserved Font Name "Playfair Display") |
| `Mulish-Variable.ttf` | Mulish (wght 200–1000) | `ofl/mulish/Mulish[wght].ttf` | SIL OFL 1.1, `OFL-Mulish.txt` |
| `JetBrainsMono-Variable.ttf` | JetBrains Mono (wght 100–800) | `ofl/jetbrainsmono/JetBrainsMono[wght].ttf` | SIL OFL 1.1, `OFL-JetBrainsMono.txt` |

Repository: https://github.com/google/fonts, commit
`e7db6ca603fd4862010383ff17ffd6cc4ffac1c0`, retrieved 2026-10-25. Files were
renamed only (brackets removed); contents are unmodified.

SHA-256:

```
c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6  PlayfairDisplay-Variable.ttf
00f1105796291a2fdda117a0fc7f25d8e68f8010cdbb34a411f60b3bd57717ac  Mulish-Variable.ttf
48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda  JetBrainsMono-Variable.ttf
```
