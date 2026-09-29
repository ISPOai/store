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

// data[2] = intensity (0..1), data[3] = block height (px), data[4] = time (s)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let intensity = u(2);
    let block_height = max(u(3), 2.0);
    let time = u(4);

    var uv = input.tex_coord;
    let row = floor(uv.y * block_height);
    let row_hash = hash1(row * 0.3183 + floor(time * 24.0));

    if (intensity > 0.0 && row_hash > 1.0 - intensity) {
        let shift = (row_hash - 0.5) * intensity * 0.35;
        uv.x = uv.x + shift;
    }

    let channel_offset = intensity * 0.03 * (row_hash - 0.5);
    let r = textureSample(input_texture, input_sampler, clamp(uv + vec2f(channel_offset, 0.0), vec2f(0.0), vec2f(1.0))).r;
    let g = textureSample(input_texture, input_sampler, clamp(uv, vec2f(0.0), vec2f(1.0))).g;
    let b = textureSample(input_texture, input_sampler, clamp(uv - vec2f(channel_offset, 0.0), vec2f(0.0), vec2f(1.0))).b;
    let a = textureSample(input_texture, input_sampler, clamp(uv, vec2f(0.0), vec2f(1.0))).a;

    return vec4f(r, g, b, a);
}
