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

fn hash2(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

// data[2] = amount (0..1), data[3] = monochrome (0/1), data[4] = time (s)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let amount = u(2);
    let monochrome = u(3);
    let time = u(4);
    let color = textureSample(input_texture, input_sampler, input.tex_coord);

    let block = vec2f(u(0), u(1)) / 8.0;
    let cell = floor(input.tex_coord * block);
    let t = floor(time * 24.0);

    if (monochrome > 0.5) {
        let n = hash2(cell + vec2f(t, t * 1.7));
        let v = (n - 0.5) * amount;
        return vec4f(clamp(color.rgb + vec3f(v), vec3f(0.0), vec3f(1.0)), color.a);
    }

    let nr = hash2(cell + vec2f(t, 0.0));
    let ng = hash2(cell + vec2f(0.0, t) + 13.0);
    let nb = hash2(cell + vec2f(t, t) + 7.0);
    let rgb = color.rgb + vec3f(nr - 0.5, ng - 0.5, nb - 0.5) * amount;
    return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), color.a);
}
