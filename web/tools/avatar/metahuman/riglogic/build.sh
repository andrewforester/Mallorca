#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../../../../src/ui/avatar/rig/riglogic.wasm"
WORK="${RL_WORK:-$(mktemp -d)}"
COMMIT=d3d329b
if [ ! -d "$WORK/OpenRigLogic" ]; then
  git clone --quiet https://github.com/EpicGames/OpenRigLogic.git "$WORK/OpenRigLogic"
  git -C "$WORK/OpenRigLogic" checkout --quiet "$COMMIT"
fi
emcmake cmake -S "$WORK/OpenRigLogic" -B "$WORK/build" -G Ninja -DCMAKE_BUILD_TYPE=Release -DRL_BUILD_TESTS=OFF \
  -DRL_BUILD_BENCHMARKS=OFF -DRL_BUILD_EXAMPLES=OFF -DRL_DISABLE_RUNTIME_FEATURE_DETECTION=ON > /dev/null
cmake --build "$WORK/build" > /dev/null
DEFS=$(grep -o '\-DRL_[A-Z_0-9]*' "$WORK/build/build.ninja" | sort -u | tr '\n' ' ')
em++ -O3 -std=c++17 -DNDEBUG $DEFS -I"$WORK/OpenRigLogic/include" "$HERE/rl.cpp" "$WORK"/build/libriglogic*.a -o "$OUT" \
  -sSTANDALONE_WASM --no-entry -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 \
  -sEXPORTED_FUNCTIONS=_rl_alloc,_rl_load,_rl_joint_count,_rl_neutral,_rl_set,_rl_calculate,_rl_joints,_rl_blend_count,_rl_blends,_rl_map_count,_rl_maps
ls -l "$OUT"
