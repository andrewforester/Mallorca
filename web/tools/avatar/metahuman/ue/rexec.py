import sys
import time

sys.path.insert(0, r"C:\Program Files\Epic Games\UE_5.8\Engine\Plugins\Experimental\PythonScriptPlugin\Content\Python")
import remote_execution as rx

config = rx.RemoteExecutionConfig()
config.multicast_bind_address = "127.0.0.1"
remote = rx.RemoteExecution(config)
remote.start()
deadline = time.time() + 60
while not remote.remote_nodes and time.time() < deadline:
    time.sleep(0.5)
if not remote.remote_nodes:
    remote.stop()
    sys.exit("no editor found")
remote.open_command_connection(remote.remote_nodes[0]["node_id"])
result = remote.run_command(sys.argv[1], unattended=True, exec_mode=rx.MODE_EXEC_FILE, raise_on_failure=False)
for line in result.get("output", []):
    print(line.get("output", "").rstrip())
print("success" if result.get("success") else "FAILED: " + str(result.get("result")))
remote.stop()
