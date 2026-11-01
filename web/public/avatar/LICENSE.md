# Her model

`mallorca.glb` is `Female_Adult_07` of the Microsoft Rocketbox avatar library
(https://github.com/microsoft/Microsoft-Rocketbox), converted by `web/tools/avatar/convert.py`: the ARKit
blendshapes and the Oculus visemes renamed, the other blendshapes and the legs removed, textures at 1024 px.
`portrait.webp` is a still of it. Both are under the library's license:

    MIT License

    Copyright (c) 2020 Microsoft

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

# The MetaHuman look

The MetaHuman look of #75 is not built yet. These are the terms it is built under, checked on 2026-11-01 against
the Unreal Engine EULA (https://www.unrealengine.com/eula/unreal), the MetaHuman licence FAQ
(https://www.metahuman.com/license) and the Epic Content License Agreement (https://www.unrealengine.com/eula/content).

## What is allowed

- **Any engine, at runtime, in the browser.** From Unreal Engine 5.6 MetaHuman is part of the Unreal Engine license.
  The FAQ: "MetaHuman characters and animation are classed as Non-Engine Products under the Unreal Engine EULA, so
  neither their use as linear media output or at runtime in games (or other interactive applications) using engines
  other than Unreal Engine triggers royalty obligations." EULA 4(a)(i): asset files such as character models and
  animations developed using Engine Code "remain Non-Engine Products even if included in Products that use or rely
  on other video game engines." No royalty is owed.
- **Serving the built assets publicly.** Non-Engine Products may be Distributed "to any person or entity"
  (EULA 4(a)(i)), so the built meshes, textures and baked glb may be committed to this public repository and served.
- **Her DNA in the browser (tier 1).** Her DNA file is one of her asset files, a Non-Engine Product like her meshes.
  Neither the EULA nor the FAQ names DNA files explicitly; this is the least certain point and may be confirmed with
  Epic through the licence page's contact form.

## Conditions

- **She is made in MetaHuman Creator inside Unreal Engine 5.6 or later.** The MetaHuman Content Addendum of the
  Content License says MetaHumans downloaded from the former web Creator or Bridge "may only be used and shared as
  UE-Only Content". A character made in or migrated from the web app is therefore not used.
- **Only Creator's own hair, clothes and textures.** Outfits and hair bought or downloaded on Fab carry their own
  license, and some are UE-only. Each Fab item is checked before it is used, and recorded here.
- **RigLogic and the DNA reader come from OpenRigLogic** (https://github.com/EpicGames/OpenRigLogic, MIT).
  MetaHuman-DNA-Calibration is not used: its license limits its output to Unreal Engine.
- **No GPL code with Unreal code.** EULA 6(c) forbids combining the Licensed Technology with GPL code. The Poly Hammer
  Character DNA add-on (GPL-3.0) runs only as a separate Blender tool on our exported assets; its code is not copied
  into this repository or the game.
- **Revenue threshold.** Below $1,000,000 USD gross revenue over the last 12 months no seat is needed (EULA 6(b)(i)).
  Above it, rendering MetaHumans outside Unreal Engine needs an Unreal Engine seat subscription (FAQ).
- **No AI training.** Her renders and animation curves are not used to build or enhance a dataset, or to train or
  test machine learning, deep learning or neural networks (FAQ). Driving her face from the emotion engine and the
  talk model is allowed.
- **No reuse by players.** Players are not permitted to put her assets in their own products (EULA 4(c)), and the
  game offers no download of them.
- **Names and credits.** The MetaHuman name and logo are Epic trademarks and are not used in the game's UI or
  marketing (EULA 7(a)). If the game gets credits, they carry "Mallorca uses Unreal® Engine. Unreal® is a trademark
  or registered trademark of Epic Games, Inc. in the United States of America and elsewhere." and
  "Unreal® Engine, Copyright 1998 – 2026, Epic Games, Inc. All rights reserved."
