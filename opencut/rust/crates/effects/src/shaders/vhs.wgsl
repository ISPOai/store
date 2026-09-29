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

fn u(index: i32) -> f32 {
    return uniforms.data[index];
}

fn hash1(n: f32) -> f32 {
    return fract(sin(n) * 43758.5453123);
}

// data[2] = intensity (0..1), data[3] = time (s)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let intensity = u(2);
    let time = u(3);

    var uv = input.tex_coord;
    let scanline = floor(uv.y * 240.0);
    let wobble = (hash1(scanline + floor(time * 30.0)) - 0.5) * intensity * 0.02;
    uv.x = uv.x + wobble;

    // Tracking band near the bottom drifts vertically over time.
    let band = abs(uv.y - fract(time * 0.7));
    if (band < 0.03 * intensity + 0.002) {
        uv.x = uv.x + (hash1(floor(uv.y * 100.0)) - 0.5) * intensity * 0.12;
    }

    let r = textureSample(input_texture, input_sampler, clamp(uv + vec2f(intensity * 0.012, 0.0), vec2f(0.0), vec2f(1.0))).r;
    let g = textureSample(input_texture, input_sampler, clamp(uv, vec2f(0.0), vec2f(1.0))).g;
    let b = textureSample(input_texture, input_sampler, clamp(uv - vec2f(intensity * 0.012, 0.0), vec2f(0.0), vec2f(1.0))).b;
    let a = textureSample(input_texture, input_sampler, clamp(uv, vec2f(0.0), vec2f(1.0))).a;

    return vec4f(r, g, b, a);
}
