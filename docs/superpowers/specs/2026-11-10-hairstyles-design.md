# Hairstyles per character

## Goal

Her hair today is the MetaHuman groom `Hair_L_StraightBangs`, baked into the rig. The owner wants a fuller, more
interesting look and chose three grooms of the MetaHuman library from a sheet of candidates rendered on her, and keeps
her first groom as a fourth:

| key          | groom                    | characters        |
| ------------ | ------------------------ | ----------------- |
| `side-swept` | `Hair_M_SideSweptFringe` | `mallorca`, `mira` |
| `curly-bob`  | `Hair_M_BobCurly`        | `lola`            |
| `updo-buns`  | `Hair_S_UpdoBuns`        | `ingrid`          |
| `straight-bangs` | `Hair_L_StraightBangs` | `nina`          |

`side-swept` is the main one. More characters come later and each gets one of these keys.

## Decisions

- **Hair leaves the rig.** `rig.json` and `rig.bin` keep the head, body, sweater and the rest; each hairstyle is a
  folder `her/hair/<key>/` with `hair.json`, `hair.bin`, `hair_cards.webp` and `scalp.webp`; its still is
  `portraits/<key>.webp`, outside the model folders that a game without WebGL never fetches. A game loads only the
  hairstyle of its character.
- **`head_color_map.webp` no longer carries painted hair.** The scalp under the hair is darkened in the skin shader by
  the hairstyle's `scalp.webp`, with the tone the export painted before. The brows stay painted.
- **The scalp mask comes from the roots of the groom.** Only some grooms ship a `_baked` texture, but every groom has
  `<groom>_RooUVSeedCoverage`, the head UV of the root of each texel of its card atlas. The density of those root UVs
  over the head UV is the scalp mask; for `Hair_L_StraightBangs` it matches its `_baked` texture.
- **Each groom is fitted onto the archetype head.** Some grooms are modelled for a taller head (`Hair_M_SideSweptFringe`
  sits about 13 cm too high). The export finds a translation that lays the cards nearest the skin 2.5 mm above the
  archetype scalp. Grooms modelled on the archetype come out within 1.5 cm of where they are, so a translation under
  3 cm is dropped and those grooms stay as modelled.
- **The folder limit rises from 17 MB to 26 MB**, in its own commits: a game loads the rig and one hairstyle, about
  what it loaded before, while the folder holds four.
- Out of scope: switching hairstyles in the game, hair colour per character, other grooms.

## Export: `web/tools/avatar/metahuman/`

- `ue/cards.py` exports the grooms listed in `export/hairstyles.json` (key to groom name), each into
  `cards/<groom>/`: the card sections `hair_g<group>_s<section>.json` of the lowest LOD of every group and the groom's
  textures, `<groom>_CardsAtlas_Attribute.tga` and `<groom>_RooUVSeedCoverage.tga` among them.
- `export/groom.py`: for each hairstyle, read its cards, fit the translation (trimmed nearest-point iterations,
  translation only, starting from the tops of the hair and of the head), transfer the cards onto her head as today
  (`follow`), draw `hair_cards.webp` from the attribute atlas and `scalp.webp` (512 px) from the root UVs.
- `export/build.py`: the rig once, then each hairstyle pushed out of the sweater in the seated pose (`lbs.py`) and
  written by `pack.py` into `hair/<key>/`: `hair.json` is `{ "mesh": MeshSection }` over `hair.bin`.
- `--check` decodes every hairstyle too, prints its fit translation, and fails when a translation exceeds 20 cm, a card
  vertex stays inside the sweater, or the folder exceeds the limit.

## Game: `web/src/ui/avatar/`

- `hair.ts`: `HairKey` and `HAIR: Record<PersonalityKey, HairKey>`; a character without a hairstyle does not compile.
- `rig/assets.ts`: `loadHair(base, key, fetcher)` returns the section and its buffer; a missing file throws like the rig.
- `rig/RigAvatar.ts`: the constructor takes the hairstyle key; `load()` fetches the rig and the hairstyle together and
  builds the cards mesh from the hair buffer, in the two passes of today.
- `rig/materials.ts` and `rig/skin.ts`: the hair textures come from the hairstyle folder; `skinMaterial` takes the scalp
  mask and mixes the skin towards the hair tone by it.
- `FaceSeat.tsx` takes `character`, renders `rigRenderer(RIG_BASE, HAIR[character])` and shows
  `portraits/<key>.webp` as the still. `App` passes the character it already has.
- `tools/avatar/portraits.ts` renders the still of each hairstyle from the 3D face, framed like the live face.

## Checks

- Unit: `HAIR` covers `CHARACTERS`; `loadHair` decodes a section and throws on a missing file; the skin shader mixes by
  `uScalp`; `FaceSeat` picks the portrait of the character's hairstyle.
- Visual: a sheet of her with the four hairstyles, and the contact sheets, before the pull request.
