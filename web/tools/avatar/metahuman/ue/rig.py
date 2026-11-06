import unreal
sub = unreal.get_editor_subsystem(unreal.MetaHumanCharacterEditorSubsystem)
dst = open("C:/mallorca/ue/current_asset.txt").read().strip()
c = unreal.load_asset(dst)
print("rig types", [x for x in dir(unreal.MetaHumanRigType) if x.isupper()])
if not sub.is_object_added_for_editing(c):
    sub.try_add_object_to_edit(c)
req = unreal.MetaHumanCharacterAutoRiggingRequestParams()
req.blocking = True
req.report_progress = False
names = [x for x in dir(unreal.MetaHumanRigType) if x.isupper()]
full = next((n for n in names if "BLEND" in n), names[-1])
req.rig_type = getattr(unreal.MetaHumanRigType, full)
print("requesting", full)
sub.request_auto_rigging(c, req)
print("rig done")
