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

// data[2..4] = shadow color (linear rgb), data[5..7] = highlight color (linear rgb)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let shadow = vec3f(u(2), u(3), u(4));
    let highlight = vec3f(u(5), u(6), u(7));
    let color = textureSample(input_texture, input_sampler, input.tex_coord);

    let luma = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
    let rgb = mix(shadow, highlight, clamp(luma, 0.0, 1.0));

    return vec4f(rgb, color.a);
}
