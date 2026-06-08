#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sa_dir="$(cd "${script_dir}/.." && pwd)"
project_dir="$(cd "${sa_dir}/.." && pwd)"
source "${script_dir}/lib/runtime_env.sh"
tmp_dir="$(mktemp -d)"
hub_port="${SA_TEST_PROXY_PORT:-$(sa_test_free_port)}"
auth_token="client-secret"
base_url="http://127.0.0.1:${hub_port}"
hub_pid=""

cleanup() {
  if [[ -n "${hub_pid}" ]]; then
    sa_test_stop_pid "${hub_pid}"
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

sa_test_assert_port_free "${hub_port}"
sa_test_write_env_from_root "${project_dir}/.env" "${tmp_dir}/.env" "${hub_port}" "${auth_token}"
hub_pid="$(sa_test_start_hubproxy "${sa_dir}" "${tmp_dir}" "${tmp_dir}/hubproxy.log")"
if ! sa_test_wait_port "${hub_port}" 50 0.1; then
  echo "hubproxy did not start on ${hub_port}" >&2
  cat "${tmp_dir}/hubproxy.log" >&2 || true
  exit 1
fi

rpc() {
  curl -sS --max-time 15 \
    -H "authorization: Bearer ${auth_token}" \
    -H 'content-type: application/json' \
    --data "$1" \
    "${base_url}/rpc"
}

exp_list="$(rpc '{"jsonrpc":"2.0","id":1,"method":"experimentalFeature/list","params":{}}')"
exp_set="$(rpc '{"jsonrpc":"2.0","id":2,"method":"experimentalFeature/enablement/set","params":{"enablement":{"reasoning":false,"beta":true}}}')"
exp_missing="$(rpc '{"jsonrpc":"2.0","id":3,"method":"experimentalFeature/enablement/set","params":{}}')"
exp_null="$(rpc '{"jsonrpc":"2.0","id":4,"method":"experimentalFeature/enablement/set","params":{"enablement":null}}')"
remote_enable="$(rpc '{"jsonrpc":"2.0","id":5,"method":"remoteControl/enable","params":{"serverName":"srv","installationId":"inst","environmentId":"env"}}')"
remote_disable="$(rpc '{"jsonrpc":"2.0","id":6,"method":"remoteControl/disable","params":{"serverName":"srv","installationId":"inst","environmentId":"env"}}')"
remote_status="$(rpc '{"jsonrpc":"2.0","id":7,"method":"remoteControl/status/read","params":{"serverName":"srv","installationId":"inst","environmentId":"env"}}')"
login_cancel="$(rpc '{"jsonrpc":"2.0","id":8,"method":"account/login/cancel","params":{}}')"
logout="$(rpc '{"jsonrpc":"2.0","id":9,"method":"account/logout","params":{}}')"
file_approval="$(rpc '{"jsonrpc":"2.0","id":10,"method":"item/fileChange/requestApproval","params":{}}')"
cmd_terminate="$(rpc '{"jsonrpc":"2.0","id":11,"method":"command/exec/terminate","params":{"processId":"missing"}}')"
cmd_resize="$(rpc '{"jsonrpc":"2.0","id":12,"method":"command/exec/resize","params":{"processId":"missing","cols":80,"rows":24}}')"
proc_stdin="$(rpc '{"jsonrpc":"2.0","id":13,"method":"process/writeStdin","params":{"processHandle":"missing","data":"x"}}')"
proc_resize="$(rpc '{"jsonrpc":"2.0","id":14,"method":"process/resizePty","params":{"processHandle":"missing","cols":80,"rows":24}}')"
mock_echo="$(rpc '{"jsonrpc":"2.0","id":15,"method":"mock/experimentalMethod","params":{"value":{"a":1,"nested":[true,null,"x"]}}}')"
feedback="$(rpc '{"jsonrpc":"2.0","id":16,"method":"feedback/upload","params":{"threadId":"thr-123"}}')"
id_after_method="$(rpc '{"jsonrpc":"2.0","method":"configRequirements/read","id":987,"params":{}}')"

python3 - <<'PY' \
  "${exp_list}" "${exp_set}" "${exp_missing}" "${exp_null}" \
  "${remote_enable}" "${remote_disable}" "${remote_status}" \
  "${login_cancel}" "${logout}" "${file_approval}" \
  "${cmd_terminate}" "${cmd_resize}" "${proc_stdin}" "${proc_resize}" \
  "${mock_echo}" "${feedback}" "${id_after_method}"
import json
import sys

(
    exp_list,
    exp_set,
    exp_missing,
    exp_null,
    remote_enable,
    remote_disable,
    remote_status,
    login_cancel,
    logout,
    file_approval,
    cmd_terminate,
    cmd_resize,
    proc_stdin,
    proc_resize,
    mock_echo,
    feedback,
    id_after_method,
) = [json.loads(arg)["result"] for arg in sys.argv[1:]]

assert exp_list["data"][0]["name"] == "reasoning", exp_list
assert exp_list["nextCursor"] is None, exp_list
assert exp_set["enablement"] == {"reasoning": False, "beta": True}, exp_set
assert exp_missing["enablement"] == {}, exp_missing
assert exp_null["enablement"] == {}, exp_null

assert remote_enable == {
    "status": "connected",
    "serverName": "srv",
    "installationId": "inst",
    "environmentId": "env",
}, remote_enable
assert remote_disable == {
    "status": "disabled",
    "serverName": "srv",
    "installationId": "inst",
    "environmentId": "env",
}, remote_disable
assert remote_status == remote_disable, remote_status

assert login_cancel == {"canceled": True, "loggedOut": False}, login_cancel
assert logout == {"canceled": False, "loggedOut": True}, logout
assert file_approval == {"decision": "accept"}, file_approval
assert cmd_terminate == {"ok": True}, cmd_terminate
assert cmd_resize == {"ok": True}, cmd_resize
assert proc_stdin == {"ok": True}, proc_stdin
assert proc_resize == {"ok": True}, proc_resize
assert mock_echo == {"echoed": {"a": 1, "nested": [True, None, "x"]}}, mock_echo
assert feedback == {"threadId": "thr-123"}, feedback
assert id_after_method["requirements"]["network"] is None, id_after_method

id_after_method_envelope = json.loads(sys.argv[-1])
assert id_after_method_envelope["id"] == 987, id_after_method_envelope
PY

echo "rpc_misc_parity_ok"
