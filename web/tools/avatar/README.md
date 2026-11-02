# Avatar

`convert.py` turns a Rocketbox avatar with facial blendshapes into the glb the game loads, with Blender's own FBX
importer and glTF exporter and no add-on. It keeps the 52 ARKit blendshapes (`AK_*`, renamed to the ARKit names) and
the 15 Oculus visemes (`AA_VI_*`, renamed `viseme_sil` to `viseme_U`), drops the other blendshapes, renames the
bones the face drives (`Head`, `Neck`, `Spine2`, `LeftEye`, `RightEye`, `LeftShoulder`, `RightShoulder`, `LeftArm`,
`RightArm`), cuts the mesh below the waist, scales the textures down and writes WebP images.

From `web/`, with Blender 4.2 or later on the path:

```sh
src=https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars/Adults/Female_Adult_07
mkdir -p /tmp/rocketbox && cd /tmp/rocketbox
curl -sLO $src/Export/Female_Adult_07_facial.fbx
for t in body_color body_normal body_specular head_color head_normal head_specular opacity_color; do
  curl -sLO $src/Textures/f007_$t.tga
done
cd - && blender -b --python tools/avatar/convert.py -- /tmp/rocketbox/Female_Adult_07_facial.fbx \
  public/avatar/mallorca.glb 1024 0.85
```

The arguments are the source, the output, the texture size in pixels and the height in metres below which the mesh is
cut. The library is MIT; its license travels with the model in `public/avatar/LICENSE.md`.
