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

fn hash2(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

// data[2] = intensity (0..1), data[3] = time (s)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let intensity = u(2);
    let time = u(3);
    let color = textureSample(input_texture, input_sampler, input.tex_coord);

    // Sepia tone.
    let luma = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
    let sepia = vec3f(luma * 1.07, luma * 0.9, luma * 0.75);

    // Film grain.
    let cell = input.tex_coord * vec2f(u(0), u(1));
    let grain = (hash2(cell + vec2f(time * 41.0, time * 23.0)) - 0.5) * 0.12 * intensity;

    // Vertical scratches that flash in and out.
    let scratch_column = floor(hash1(floor(time * 3.0)) * 200.0);
    let scratch_x = scratch_column / 200.0;
    let scratch = step(0.995, 1.0 - abs(input.tex_coord.x - scratch_x));
    let scratch_opacity = scratch * 0.6 * intensity * hash1(floor(time * 3.0) * 7.0);

    // Vignette.
    let dist = length(input.tex_coord - vec2f(0.5, 0.5));
    let vignette = smoothstep(0.55, 1.0, dist) * 0.5 * intensity;

    let flicker = 1.0 - (hash1(floor(time * 12.0)) - 0.5) * 0.2 * intensity;

    var rgb = mix(color.rgb, sepia, intensity * 0.6);
    rgb = rgb + vec3f(grain);
    rgb = rgb * flicker;
    rgb = rgb * (1.0 - vignette);
    rgb = rgb + vec3f(scratch_opacity);

    return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), color.a);
}
