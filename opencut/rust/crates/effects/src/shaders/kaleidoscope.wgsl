struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct EffectUniforms {
    data: array<f32, 64>,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

const PI: f32 = 3.141592653589793;

fn u(index: i32) -> f32 {
    return uniforms.data[index];
}

// data[2] = segments, data[3] = rotation (degrees)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let segments = max(floor(u(2)), 2.0);
    let rotation = radians(u(3));
    let center = vec2f(0.5, 0.5);
    let p = input.tex_coord - center;

    var angle = atan2(p.y, p.x) + rotation;
    angle = fract(angle / (2.0 * PI)) * 2.0 * PI;

    let segment_angle = 2.0 * PI / segments;
    let mirrored = abs((angle % segment_angle) - segment_angle * 0.5);
    let radius = length(p);
    let uv = center + vec2f(cos(mirrored), sin(mirrored)) * radius;

    return textureSample(input_texture, input_sampler, clamp(uv, vec2f(0.0), vec2f(1.0)));
}
