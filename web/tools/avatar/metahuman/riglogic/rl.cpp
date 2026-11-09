#include <dna/BinaryStreamReader.h>
#include <dna/Configuration.h>
#include <riglogic/RigLogic.h>
#include <trio/streams/MemoryStream.h>

#include <cstdint>
#include <emscripten/emscripten.h>
#include <cstdlib>

static dna::BinaryStreamReader* reader = nullptr;
static rl4::RigLogic* rig = nullptr;
static rl4::RigInstance* inst = nullptr;

extern "C" {

EMSCRIPTEN_KEEPALIVE int rl_load(const char* bytes, int size) {
    auto stream = trio::MemoryStream::create(static_cast<std::size_t>(size));
    stream->open();
    stream->write(bytes, static_cast<std::size_t>(size));
    stream->seek(0);
    reader = dna::BinaryStreamReader::create(stream, dna::DataLayer::Behavior);
    reader->read();
    rl4::Configuration config;
    config.calculationType = rl4::CalculationType::Scalar;
    config.floatingPointType = rl4::FloatingPointType::Float;
    rig = rl4::RigLogic::create(reader, config);
    inst = rl4::RigInstance::create(rig);
    inst->setLOD(0);
    return inst->getRawControlCount();
}

EMSCRIPTEN_KEEPALIVE int rl_joint_count() { return static_cast<int>(rig->getNeutralJointValues().size()); }
EMSCRIPTEN_KEEPALIVE const float* rl_neutral() { return rig->getNeutralJointValues().data(); }
EMSCRIPTEN_KEEPALIVE void rl_set(int index, float value) { inst->setRawControl(static_cast<std::uint16_t>(index), value); }
EMSCRIPTEN_KEEPALIVE void rl_calculate() { rig->calculate(inst); }
EMSCRIPTEN_KEEPALIVE const float* rl_joints() { return inst->getJointOutputs().data(); }
EMSCRIPTEN_KEEPALIVE int rl_blend_count() { return static_cast<int>(inst->getBlendShapeOutputs().size()); }
EMSCRIPTEN_KEEPALIVE const float* rl_blends() { return inst->getBlendShapeOutputs().data(); }
EMSCRIPTEN_KEEPALIVE int rl_map_count() { return static_cast<int>(inst->getAnimatedMapOutputs().size()); }
EMSCRIPTEN_KEEPALIVE const float* rl_maps() { return inst->getAnimatedMapOutputs().data(); }
}

extern "C" {
EMSCRIPTEN_KEEPALIVE void* rl_alloc(int size) { return std::malloc(static_cast<std::size_t>(size)); }
}
