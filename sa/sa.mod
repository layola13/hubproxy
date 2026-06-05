# HubProxy package manifest
#
# This package is built from the local repo tree. Standard library imports
# come from `sa_std`, and the HTTP client/server plugins are resolved by the
# host runtime.
require_plugin http-client @0.1.0 abi 1
require_plugin http-server @0.1.0 abi 1
require_plugin deno @0.1.0 abi 1
