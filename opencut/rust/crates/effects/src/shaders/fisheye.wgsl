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

// data[2] = strength (0..1)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let strength = u(2);
    let center = vec2f(0.5, 0.5);
    let dir = input.tex_coord - center;
    let r2 = dot(dir, dir);
    let amount = strength * 0.6;
    let uv = center + dir * (1.0 + amount * r2);

    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }
    return textureSample(input_texture, input_sampler, uv);
}
