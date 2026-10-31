import bpy, bmesh, sys, re, os
args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
size = int(args[2]) if len(args) > 2 else 1024
cut = float(args[3]) if len(args) > 3 else 0.85
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
bones = {'Bip01 Head': 'Head', 'Bip01 Neck': 'Neck', 'Bip01 Spine2': 'Spine2', 'Bip01 Spine1': 'Spine1',
         'Bip01 Spine': 'Spine', 'Bip01 Pelvis': 'Hips', 'Bip01 LEye': 'LeftEye', 'Bip01 REye': 'RightEye',
         'Bip01 L Clavicle': 'LeftShoulder', 'Bip01 R Clavicle': 'RightShoulder',
         'Bip01 L UpperArm': 'LeftArm', 'Bip01 R UpperArm': 'RightArm',
         'Bip01 L Forearm': 'LeftForeArm', 'Bip01 R Forearm': 'RightForeArm', 'Bip01 MJaw': 'Jaw'}
for b in arm.data.bones:
    if b.name in bones:
        old = b.name
        b.name = bones[old]
visemes = {'Sil': 'sil', 'KK': 'kk'}
keys = mesh.data.shape_keys.key_blocks
for k in list(keys):
    m = re.match(r'AK_\d+_(\w+)$', k.name)
    v = re.match(r'AA_VI_\d+_(\w+)$', k.name)
    if k.name == 'Basis':
        continue
    if m:
        k.name = m.group(1)[0].lower() + m.group(1)[1:]
    elif v:
        k.name = 'viseme_' + visemes.get(v.group(1), v.group(1))
    else:
        mesh.shape_key_remove(k)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(mesh.data)
mw = mesh.matrix_world
bmesh.ops.delete(bm, geom=[v for v in bm.verts if (mw @ v.co).z < cut], context='VERTS')
bmesh.update_edit_mesh(mesh.data)
bpy.ops.object.mode_set(mode='OBJECT')
for img in bpy.data.images:
    if img.size[0] > size:
        img.scale(size, size)
for mat in mesh.data.materials:
    opaque = 'opacity' not in mat.name
    mat.blend_method = 'OPAQUE' if opaque else 'HASHED'
    mat.surface_render_method = 'DITHERED'
    for n in list(mat.node_tree.nodes):
        if n.type == 'TEX_IMAGE' and n.image and 'specular' in (n.image.filepath or '').lower():
            mat.node_tree.nodes.remove(n)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='WEBP',
    export_image_quality=82, export_animations=False, export_morph_normal=False,
    export_yup=True, export_apply=False, export_skins=True, export_morph=True)
print('DONE', os.path.getsize(out))
